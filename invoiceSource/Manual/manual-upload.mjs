/** Helpers for manual PDF uploads. Kept separate so they can be unit-tested. */
import path from "node:path";

import { agentDataToManualFields, isBlank, mergeManualFields, runLlamaPipeline, runReactPipeline } from "../convert.mjs";
import { insertDraft } from "../Gmail/gmail-sync.mjs";

export function isPdfBuffer(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

export function storedFileNameFor(originalName, stamp) {
  const base = String(originalName || "invoice")
    .split(/[\\/]/)
    .pop()
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "invoice";
  return `manual-${stamp}-${base}.pdf`;
}

export function nextFileId(registry) {
  return registry.reduce((max, entry) => Math.max(max, Number(entry.file_id) || 0), 0) + 1;
}

/**
 * Convert-then-insert for one staged manual upload. Mode "llama" runs the
 * shared direct extraction and fills blank form fields; mode "react" runs
 * the validating agentic loop first and overlays the user-typed values.
 */
export async function insertManualFromConversion(
  connection,
  entry,
  { mode, userFields, fileSizeBytes, schemaText, stagedBytes, maxAttempts = 3, convertFn, modelFn },
) {
  if (mode !== "llama" && mode !== "react") {
    throw new Error(`insertManualFromConversion: mode must be 'llama' or 'react'.`);
  }
  let effectiveFields;
  let filledKeys = [];
  let attempts;
  if (mode === "llama") {
    const { draft } = await runLlamaPipeline(stagedBytes, {
      filename: entry.file_name,
      schemaText,
      ...(convertFn ? { convertFn } : {}),
    });
    const merged = mergeManualFields(userFields, draft);
    effectiveFields = merged.merged;
    filledKeys = merged.filledKeys;
  } else {
    const { agentData, attempts: loopAttempts } = await runReactPipeline(stagedBytes, {
      filename: entry.file_name,
      schemaText,
      ...(modelFn ? { modelFn } : {}),
      maxAttempts,
    });
    attempts = loopAttempts;
    const base = agentDataToManualFields(agentData);
    effectiveFields = { ...userFields };
    for (const key of Object.keys(base)) {
      if (isBlank(userFields[key]) && !isBlank(base[key])) {
        effectiveFields[key] = base[key];
        filledKeys.push(key);
      }
    }
  }
  const stored = await insertManualInvoice(connection, entry, { ...effectiveFields, fileSizeBytes });
  return { stored, extracted: true, filledKeys, ...(attempts === undefined ? {} : { attempts }) };
}

/** Absolute disk path for a registry entry (bundled files/ or ephemeral tmp/). */
export function entryAbsolutePath(entry, { rootDir, tmpRoot }) {
  if (String(entry.file_path).startsWith("tmp/")) {
    return path.join(tmpRoot, entry.file_path.slice(4));
  }
  return path.resolve(rootDir, entry.file_path);
}

function trimmed(value) {
  return String(value ?? "").trim();
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Insert a manually uploaded invoice into Oracle: one file_details row
 * (for the already-stored PDF), one invoice_header row, and one invoice_lines
 * row from the form. Throws on invalid fields before touching the database.
 */
export function insertManualInvoice(connection, entry, fields) {
  return insertReceivedInvoice(connection, entry, fields, {
    channel: "Manual Upload",
    createdBy: "MANUAL_UPLOAD",
  });
}

/**
 * Shared insert for every received channel (Gmail, Manual, WhatsApp):
 * one file_details row, one invoice_header row, one invoice_lines row.
 */
export async function insertReceivedInvoice(connection, entry, fields, { channel, createdBy }) {
  const problems = [];
  if (!trimmed(fields.invoiceNumber)) problems.push("Invoice number is required.");
  if (!trimmed(fields.supplier)) problems.push("Supplier is required.");
  const amount = finiteNumber(fields.amount);
  if (amount === null) problems.push("Header amount must be a number.");
  const lineAmount = finiteNumber(fields.lineAmount);
  if (lineAmount === null) problems.push("Line amount must be a number.");
  const lineQuantity = finiteNumber(fields.lineQuantity);
  if (lineQuantity === null) problems.push("Line quantity must be a number.");
  if (problems.length > 0) {
    throw new Error(`Manual invoice invalid: ${problems.join(" ")}`);
  }
  const quantity = lineQuantity === 0 ? 0 : lineQuantity;
  const draft = {
    invoiceNumber: trimmed(fields.invoiceNumber),
    vendorName: trimmed(fields.supplier),
    invoiceDate: trimmed(fields.invoiceDate),
    dueDate: "",
    amountDue: amount,
    currency: ["USD", "EUR", "GBP"].includes(String(fields.currency).toUpperCase())
      ? String(fields.currency).toUpperCase()
      : "USD",
    projectNumber: trimmed(fields.projectNumber),
    jobNumber: trimmed(fields.jobNumber),
    paymentTerms: "",
    previousUnpaidBalance: null,
    totalTax: 0,
    totalVat: 0,
    billingAddress: trimmed(fields.billToAddress),
    billingAddressRecipient: "",
    customerAddress: trimmed(fields.billToAddress),
    customerAddressRecipient: "",
    remittanceAddress: trimmed(fields.remittanceAddress),
    remittanceAddressRecipient: "",
    shippingAddress: "",
    shippingAddressRecipient: "",
    shippingCost: null,
    vendorAddress: "",
    notes: "",
    purchaseOrder: "",
    lines: [
      {
        lineNum: "1",
        name: "",
        productCode: "",
        description: trimmed(fields.lineDescription) || trimmed(fields.invoiceNumber),
        quantity,
        units: trimmed(fields.lineUnits) || "ea",
        unitPrice: quantity !== 0 ? lineAmount / quantity : lineAmount,
        amount: lineAmount,
      },
    ],
    lowConfidence: Boolean(fields.lowConfidence),
  };
  return insertDraft(
    connection,
    draft,
    {
      storedName: entry.file_name,
      originalName: entry.file_name,
      filePath: entry.file_path,
      fileSizeBytes: finiteNumber(fields.fileSizeBytes) ?? 0,
      messageId: fields.messageId ?? null,
      channel,
      createdBy,
      fallbackDescription: trimmed(fields.lineDescription) || draft.invoiceNumber,
    },
  );
}
