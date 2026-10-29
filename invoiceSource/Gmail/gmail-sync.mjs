/**
 * Gmail -> Meta Model API -> Oracle sync (manual trigger only).
 *
 * For each recent Gmail message with a PDF attachment: download the PDF,
 * store it under files/Gmail/, read the staged file back, extract its
 * text, ask Muse Spark to read the invoice text, and insert file_details +
 * invoice_header (+1 line) rows so the dashboard Live (Oracle) view picks
 * them up. Already-imported Gmail message ids are skipped.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import oracledb from "oracledb";

import { getDbPool } from "../../server/db.mjs";
import {
  buildUnprocessedPdfQuery,
  ensureLabel,
  getAccessToken,
  gmail,
  listMessages,
  markProcessed,
  root,
} from "./gmail-client.mjs";
import {
  buildLlamaPrompt,
  decodeAttachmentBody,
  headerValue as ingestHeaderValue,
  listPdfAttachments,
} from "./gmail-ingest.mjs";
import { convertWithEngine } from "../convert.mjs";
import { isPdfBuffer, storedFileNameFor } from "../Manual/manual-upload.mjs";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

let cachedSchemaText = null;

/** Read invoiceSchema.json once; Step 2 sends it to the chat model. */
export async function readInvoiceSchema() {
  if (!cachedSchemaText) {
    cachedSchemaText = await readFile(path.join(root, "server", "invoiceSchema.json"), "utf8");
  }
  return cachedSchemaText;
}

export async function nextId(connection, table, column) {
  const result = await connection.execute(
    `SELECT NVL(MAX(${column}), 0) + 1 AS NEXT_ID FROM ${table}`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return result.rows?.[0]?.NEXT_ID ?? 1;
}

/**
 * Import one PDF attachment: download, validate, extract with Muse Spark,
 * and insert file_details + invoice_header + one invoice_lines row.
 * Throws on failure so the caller can record which attachment broke while
 * the message's other attachments still import.
 */
/**
 * Shared core used by the Gmail listener and the folder loader alike:
 * stage one PDF buffer under files/Gmail/, convert the staged file to
 * invoiceSchema.json with the chat model, and insert file_details +
 * invoice_header + invoice_lines rows. Throws on failure.
 */
export async function importPdfBuffer(
  connection,
  {
    buffer,
    originalName,
    stagedName = null,
    messageId = null,
    sourceChannel = "Manual Upload",
    subject = "",
    from = "",
    date = "",
    snippet = "",
    mode = "llama",
    maxAttempts = 3,
    modelFn,
  },
  deps = {},
) {
  const {
    convertFn = convertPdfToInvoiceJson,
    modelFn: depModelFn,
    schemaTextFn = readInvoiceSchema,
    stagingDir = path.join(root, "files", "Gmail"),
    mkdirFn = mkdir,
    writeFileFn = writeFile,
    readFileFn = readFile,
  } = deps;
  const activeModelFn = modelFn ?? depModelFn;
  const channel = sourceChannel === "Gmail" ? "Gmail" : "Manual Upload";
  const createdBy = channel === "Gmail" ? "GMAIL_SYNC" : "FILE_SYNC";

  await mkdirFn(stagingDir, { recursive: true });
  const storedName =
    stagedName || storedFileNameFor(originalName || "invoice.pdf", Date.now());
  const filePath = path.relative(root, path.join(stagingDir, storedName)).replace(/\\/g, "/");
  await writeFileFn(path.join(stagingDir, storedName), buffer);

  // Step 2: read the staged file back and run the shared PDF-to-JSON
  // conversion honoring the Dashboard engine toggle (llama direct,
  // ReAct validating loop with llama fallback).
  const staged = await readFileFn(path.join(stagingDir, storedName));
  const schemaText = await schemaTextFn();
  const emailContext = buildLlamaPrompt({ subject, from, date, snippet, filename: originalName });
  const { draft, engine } = await convertWithEngine(staged, {
    filename: originalName || "invoice.pdf",
    llamaSchemaText: schemaText,
    emailContext,
    fallback: { messageId, vendorName: from, date },
    engine: mode,
    convertFn,
    ...(activeModelFn ? { modelFn: activeModelFn } : {}),
    maxAttempts,
  });

  const stored = await insertDraft(
    connection,
    draft,
    {
      storedName,
      originalName,
      filePath,
      fileSizeBytes: buffer.length,
      messageId,
      channel,
      createdBy,
      fallbackDescription: subject,
    },
  );
  return { ...stored, engine };
}

/** Columns actually present in a table (schema may predate Tables.sql). */
export async function tableColumns(connection, table) {
  const result = await connection.execute(
    "SELECT column_name FROM user_tab_columns WHERE table_name = :0",
    [table],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return new Set((result.rows || []).map((row) => row.COLUMN_NAME));
}

/**
 * INSERT that only references columns the table really has. Extra draft
 * fields are dropped instead of failing with ORA-00904; missing id
 * columns fail loudly since child rows cannot reference them.
 */
export async function insertAdaptive(connection, table, pairs, idColumn, requiredColumns = [idColumn]) {
  const existing = await tableColumns(connection, table);
  const missing = requiredColumns.filter((column) => !existing.has(column));
  if (missing.length > 0) {
    throw new Error(`${table} is missing columns: ${missing.join(", ")} (schema drift vs Tables.sql)`);
  }
  const usable = pairs.filter(([column]) => existing.has(column));
  const columns = usable.map(([column]) => column).join(", ");
  const binds = usable.map(([, value]) => value);
  const placeholders = usable.map((_, index) => `:${index}`).join(", ");
  const outIndex = usable.length;
  const result = await connection.execute(
    `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING ${idColumn} INTO :${outIndex}`,
    [...binds, { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }],
  );
  return result.outBinds?.[outIndex]?.[0];
}

/**
 * Step 3: insert one normalized invoice draft into file_details +
 * invoice_header + invoice_lines. Used by the AI convert path and the
 * direct JSON-file loader alike. Returns the stored ids.
 */
export async function insertDraft(
  connection,
  draft,
  { storedName, originalName, filePath, fileSizeBytes, messageId, channel, createdBy, fallbackDescription = "" },
) {
  // RETURNING INTO captures the id actually stored, even if a trigger or
  // identity column overrides the supplied value. That stored id is what
  // the child rows must reference, otherwise FK_HEADER_FILE fails.
  // Fallback: if the driver returns no OUT value, use the supplied id.
  const suppliedFileId = await nextId(connection, "FILE_DETAILS", "FILE_ID");
  const fileId =
    (await insertAdaptive(
      connection,
      "FILE_DETAILS",
      [
        ["FILE_ID", suppliedFileId],
        ["FILE_NAME", storedName],
        ["ORIGINAL_FILE_NAME", originalName],
        ["FILE_PATH", filePath],
        ["FILE_SIZE_BYTES", fileSizeBytes],
        ["MIME_TYPE", "application/pdf"],
        ["SOURCE_CHANNEL", channel],
        ["MESSAGE_ID", messageId],
        ["STATUS", "A"],
        ["CREATION_DATE", new Date()],
        ["CREATED_BY", createdBy],
      ],
      "FILE_ID",
      ["FILE_ID"],
    )) ?? suppliedFileId;
  // The child insert must see its parent in this same transaction. If it
  // does not, fail loudly with the cause instead of a bare ORA-02291.
  const parentCheck = await connection.execute(
    "SELECT file_id FROM file_details WHERE file_id = :0",
    [fileId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (!parentCheck.rows?.length) {
    throw new Error(
      `file_details row ${fileId} not found right after insert (trigger/identity override?)`,
    );
  }
  const suppliedHeaderId = await nextId(connection, "INVOICE_HEADER", "HEADER_ID");
  const headerId =
    (await insertAdaptive(
      connection,
      "INVOICE_HEADER",
      [
        ["HEADER_ID", suppliedHeaderId],
        ["FILE_ID", fileId],
        ["INVOICE_NUMBER", draft.invoiceNumber],
        ["VENDOR_NAME", draft.vendorName],
        ["SUPPLIER_NAME", draft.vendorName],
        ["INVOICE_DATE", draft.invoiceDate ? new Date(draft.invoiceDate) : null],
        ["RECEIVED_DATE", new Date()],
        ["AMOUNT_DUE", draft.amountDue],
        ["INVOICE_CURRENCY", draft.currency],
        ["INVOICE_SOURCE", channel],
        ["PROCESSING_STATUS", draft.lowConfidence ? "Exception" : "Received"],
        ["EXCEPTION_COUNT", draft.lowConfidence ? 1 : 0],
        ["PROJECT_NUMBER", draft.projectNumber || null],
        ["JOB_NUMBER", draft.jobNumber || null],
        ["BILLING_ADDRESS", draft.billingAddress || null],
        ["BILLING_ADDRESS_RECIPIENT", draft.billingAddressRecipient || null],
        ["CUSTOMER_ADDRESS", draft.customerAddress || null],
        ["CUSTOMER_ADDRESS_RECIPIENT", draft.customerAddressRecipient || null],
        ["REMITTANCE_ADDRESS", draft.remittanceAddress || null],
        ["REMITTANCE_ADDRESS_RECIPIENT", draft.remittanceAddressRecipient || null],
        ["SHIPPING_ADDRESS", draft.shippingAddress || null],
        ["SHIPPING_ADDRESS_RECIPIENT", draft.shippingAddressRecipient || null],
        ["SHIPPING_COST", draft.shippingCost],
        ["DUE_DATE", draft.dueDate ? new Date(draft.dueDate) : null],
        ["PAYMENT_TERMS", draft.paymentTerms || null],
        ["PREVIOUS_UNPAID_BALANCE", draft.previousUnpaidBalance],
        ["TOTAL_TAX", draft.totalTax],
        ["TOTAL_VAT", draft.totalVat],
        ["VENDOR_ADDRESS", draft.vendorAddress || null],
        ["CREATION_DATE", new Date()],
        ["CREATED_BY", createdBy],
      ],
      "HEADER_ID",
      ["HEADER_ID", "FILE_ID"],
    )) ?? suppliedHeaderId;
  // Insert the converted JSON lines; fall back to one summary line
  // when the JSON has no line detail.
  const rows =
    draft.lines.length > 0
      ? draft.lines
      : [
          {
            lineNum: "1",
            description: draft.notes || fallbackDescription,
            quantity: 1,
            units: "ea",
            unitPrice: draft.amountDue,
            amount: draft.amountDue,
          },
        ];
  for (const row of rows) {
    await insertAdaptive(
      connection,
      "INVOICE_LINES",
      [
        ["LINE_ID", await nextId(connection, "INVOICE_LINES", "LINE_ID")],
        ["HEADER_ID", headerId],
        ["LINE_NUM", row.lineNum],
        ["NAME", draft.vendorName],
        ["PRODUCT_CODE", row.productCode || null],
        ["DESCRIPTION", row.description],
        ["QUANTITY", row.quantity],
        ["UNITS", row.units],
        ["UNIT_PRICE", row.unitPrice],
        ["AMOUNT", row.amount],
        ["CREATION_DATE", new Date()],
        ["CREATED_BY", createdBy],
      ],
      "LINE_ID",
      ["LINE_ID", "HEADER_ID"],
    );
  }
  return { status: "imported", fileId, headerId, lineCount: rows.length };
}

/**
 * Gmail entry point: download one PDF attachment, validate it, then run the
 * shared importPdfBuffer core (stage, convert, insert). Throws on failure.
 */
export async function importAttachment(
  connection,
  accessToken,
  { item, attachment, subject, from, date, snippet },
  deps = {},
) {
  const { gmailFn = gmail, ...rest } = deps;
  const body = await gmailFn(
    `/messages/${item.id}/attachments/${attachment.attachmentId}`,
    accessToken,
  );
  const buffer = decodeAttachmentBody(body?.data);
  if (!isPdfBuffer(buffer)) return { status: "skipped", reason: "attachment is not a PDF" };
  if (buffer.length > MAX_UPLOAD_BYTES) return { status: "skipped", reason: "attachment over 10 MB" };
  const storedName = storedFileNameFor(
    attachment.filename || "invoice.pdf",
    Date.now(),
  ).replace(/^manual-/, "gmail-");
  return importPdfBuffer(
    connection,
    {
      buffer,
      originalName: attachment.filename || "invoice.pdf",
      stagedName: storedName,
      messageId: item.id,
      sourceChannel: "Gmail",
      subject,
      from,
      date,
      snippet,
    },
    rest,
  );
}

export async function syncGmailInvoices(
  { maxMessages = 5, processedLabel = "SIRE/Processed", archive = true, mode = "llama", maxAttempts = 3, modelFn } = {},
  deps = {},
) {
  const {
    getAccessTokenFn = getAccessToken,
    ensureLabelFn = ensureLabel,
    listMessagesFn = listMessages,
    gmailFn = gmail,
    getDbPoolFn = getDbPool,
    markProcessedFn = markProcessed,
    importAttachmentFn = importAttachment,
  } = deps;
  const convertDeps = {
    ...(deps.convertDeps || {}),
    mode,
    maxAttempts,
    ...(modelFn ? { modelFn } : {}),
  };
  const accessToken = await getAccessTokenFn();
  const labelId = await ensureLabelFn(processedLabel, accessToken);
  const list = await listMessagesFn(accessToken, {
    query: buildUnprocessedPdfQuery(processedLabel),
    maxResults: maxMessages,
  });
  const pool = await getDbPoolFn();
  const connection = await pool.getConnection();
  const summary = { checked: 0, imported: 0, skipped: 0, moved: 0, notes: [], errors: [] };
  try {
    for (const item of (list.messages || []).slice(0, maxMessages)) {
      summary.checked += 1;
      const importedBefore = summary.imported;
      try {
        const already = await connection.execute(
          "SELECT file_id FROM file_details WHERE message_id = :0",
          [item.id],
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        if ((already.rows || []).length > 0) {
          summary.skipped += 1;
          // Imported on an earlier run but never labeled: move it now.
          await markProcessedFn(item.id, labelId, accessToken, { archive });
          summary.moved += 1;
          continue;
        }
        const full = await gmailFn(`/messages/${item.id}?format=full`, accessToken);
        const headers = full?.payload?.headers || [];
        const attachments = listPdfAttachments(full);
        if (attachments.length === 0) {
          summary.skipped += 1;
          continue;
        }
        const subject = ingestHeaderValue(headers, "Subject");
        const from = ingestHeaderValue(headers, "From");
        const date = ingestHeaderValue(headers, "Date");
        for (const attachment of attachments) {
          const label = attachment.filename || attachment.attachmentId;
          try {
            const result = await importAttachmentFn(connection, accessToken, {
              item,
              attachment,
              subject,
              from,
              date,
              snippet: full?.snippet || "",
            }, convertDeps);
            if (result.status === "imported") {
              summary.imported += 1;
            } else {
              summary.skipped += 1;
              summary.notes.push(`${item.id}/${label}: ${result.reason}`);
            }
          } catch (error) {
            summary.errors.push(`${item.id}/${label}: ${error?.message || error}`);
          }
        }
        if (summary.imported > importedBefore) {
          // Invoice PDFs are in Oracle: move the message to the processed folder.
          await markProcessedFn(item.id, labelId, accessToken, { archive });
          summary.moved += 1;
        }
      } catch (error) {
        summary.errors.push(`${item.id}: ${error?.message || error}`);
      }
    }
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    throw error;
  } finally {
    try {
      await connection.close();
    } catch {
      // Ignore close errors.
    }
  }
  return summary;
}
