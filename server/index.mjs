/**
 * SIRE local backend.
 *
 * Gmail: read-only access using credentials.json (Google OAuth client)
 * and token.json (stored user token) from the project root. Secrets are
 * read here on the server only and are never sent to the browser.
 * Only mailbox profile + recent message metadata are returned.
 *
 * WhatsApp: not connected. A phone number alone cannot connect; that
 * needs a WhatsApp Business (Meta) or Twilio account. The inbox reports
 * it as "Setup pending" until those credentials exist.
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { getDbPool, getDbStatus, getLiveData } from "./db.mjs";
import { documentFileId, resolveDocumentEntry } from "./file-document.mjs";
import { enqueueForErp } from "./erp-queue.mjs";
import { markReadyInvoices } from "./readiness.mjs";
import { recordReviewDecision } from "./review-decision.mjs";
import { getAccessToken, gmail, headerValue, readJson, root } from "../invoiceSource/Gmail/gmail-client.mjs";
import { syncGmailInvoices } from "../invoiceSource/Gmail/gmail-sync.mjs";
import { entryAbsolutePath, insertManualFromConversion, isPdfBuffer, nextFileId, storedFileNameFor } from "../invoiceSource/Manual/manual-upload.mjs";
import { getWhatsAppStatus, storedWhatsappNameFor, whatsappFallbackDraft } from "../invoiceSource/Whatsapp/whatsapp.mjs";
import { convertWithEngine } from "../invoiceSource/convert.mjs";
import { insertDraft, readInvoiceSchema } from "../invoiceSource/Gmail/gmail-sync.mjs";

// Load .env from the project root (DB_USER, DB_PSW, WALLET_LOC, CONFIG_DIR,
// DSN_ADB, WALLET_PSW, MODEL_API_KEY). Secrets stay on the server.
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  console.warn("No .env file loaded; Oracle DB status will report missing keys.");
}

const PORT = Number(process.env.SIRE_API_PORT || 8787);

/**
 * Serves the source PDF for a file_details row. The browser only ever
 * sends a file_id; the file_path stored in files/file-details.json is
 * resolved here and must stay inside the project files/ directory.
 */
async function serveInvoicePdf(req, res, fileId) {
  const send = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const registry = await readJson("files/file-details.json").catch(() => []);
  const scope = new URL(req.url, "http://localhost").searchParams.get("scope");
  const resolved = await resolveDocumentEntry(fileId, {
    registry,
    getConnection: async () => (await getDbPool()).getConnection(),
    preferOracle: scope === "live",
  });
  const entry = resolved?.entry;
  if (!entry) {
    send(404, { error: "No file_details record for this invoice" });
    return;
  }
  const filesRoot = path.join(root, "files");
  const absolute = path.resolve(root, entry.file_path);
  if (!absolute.startsWith(filesRoot) || !absolute.toLowerCase().endsWith(".pdf")) {
    send(400, { error: "Stored file_path is not a PDF under files/" });
    return;
  }
  try {
    const info = await stat(absolute);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": info.size,
      "Content-Disposition": `inline; filename="${entry.file_name}"`,
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(absolute).pipe(res);
  } catch {
    send(404, { error: `PDF not found at stored file_path: ${entry.file_path}` });
  }
}

let cachedGmail = null;
let cachedAt = 0;

async function gmailStatus() {
  if (cachedGmail && Date.now() - cachedAt < 60_000) return cachedGmail;
  const accessToken = await getAccessToken();
  const profile = await gmail("/profile", accessToken);
  const list = await gmail("/messages?maxResults=5", accessToken);
  const recentMessages = [];
  for (const item of list.messages || []) {
    const message = await gmail(
      `/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      accessToken,
    );
    recentMessages.push({
      id: item.id,
      from: headerValue(message, "From"),
      subject: headerValue(message, "Subject"),
      date: headerValue(message, "Date"),
      snippet: message.snippet || "",
    });
  }
  cachedGmail = {
    connected: true,
    emailAddress: profile.emailAddress,
    messagesTotal: profile.messagesTotal,
    recentMessages,
  };
  cachedAt = Date.now();
  return cachedGmail;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Manual Upload: accepts one PDF (raw body, X-File-Name header), stores it
 * under files/Manual/, and registers a file_details row so the invoice
 * detail screen can serve it back from its stored file_path.
 */
async function handleManualUpload(req, res, send) {
  const originalName = decodeURIComponent(req.headers["x-file-name"] || "invoice.pdf");
  if (!/\.pdf$/i.test(originalName)) {
    send(400, { error: "Only PDF files can be uploaded." });
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      send(413, { error: "File is too large. The limit is 10 MB." });
      return;
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (!isPdfBuffer(buffer)) {
    send(400, { error: "The uploaded file is not a valid PDF." });
    return;
  }

  const invoicesDir = path.join(root, "files", "Manual");
  await mkdir(invoicesDir, { recursive: true });
  const storedName = storedFileNameFor(originalName, Date.now());
  const filePath = `files/Manual/${storedName}`;
  await writeFile(path.join(root, filePath), buffer);

  const registryPath = path.join(root, "files", "file-details.json");
  const registry = await readJson("files/file-details.json").catch(() => []);
  const entry = {
    file_id: nextFileId(registry),
    file_name: storedName,
    file_path: filePath,
    message_id: null,
    status: "A",
    invoice_id: null,
    invoice_number: null,
    original_file_name: originalName,
    source: "Manual Upload",
  };
  registry.push(entry);
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  send(201, {
    fileId: entry.file_id,
    fileName: entry.file_name,
    filePath: entry.file_path,
    originalFileName: originalName,
    size: buffer.length,
  });
}

/**
 * Shared convert-and-insert for a staged manual upload. Mode "llama" runs
 * the direct extraction; mode "react" runs the validating agentic loop.
 * Both read the same staged file and insert the same Oracle tables.
 */
async function convertAndInsertManual(entry, fields, mode, maxAttempts) {
  const absolute = entryAbsolutePath(entry, { rootDir: root, tmpRoot: root });
  const fileSizeBytes = (await stat(absolute)).size;
  const stagedBytes = await readFile(absolute);
  const schemaText = await readInvoiceSchema();
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    const result = await insertManualFromConversion(connection, entry, {
      mode,
      userFields: fields,
      fileSizeBytes,
      schemaText,
      stagedBytes,
      maxAttempts,
    });
    await connection.commit();
    return { ok: true, mode, ...result.stored, extracted: result.extracted, filledKeys: result.filledKeys, ...(result.attempts === undefined ? {} : { attempts: result.attempts }) };
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    throw error;
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors.
    }
  }
}

async function readJsonBody(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function findRegistryEntryOrThrow(fileId) {
  const registry = await readJson("files/file-details.json").catch(() => []);
  const entry = registry.find((item) => item.file_id === fileId);
  if (!entry) throw new Error("No file_details record for this upload. Upload the PDF first.");
  return entry;
}

/**
 * Manual Upload step 2 (llama): insert the uploaded invoice's header +
 * first line into Oracle (file_details + invoice_header + invoice_lines).
 * The PDF is already staged by handleManualUpload; this only writes the tables.
 */
async function handleManualInvoiceInsert(req, res, send) {
  let fields;
  try {
    fields = await readJsonBody(req);
  } catch {
    send(400, { error: "Request body must be JSON." });
    return;
  }
  const fileId = Number(fields.fileId);
  if (!Number.isInteger(fileId)) {
    send(400, { error: "fileId is required." });
    return;
  }
  try {
    const entry = await findRegistryEntryOrThrow(fileId);
    try {
      await stat(entryAbsolutePath(entry, { rootDir: root, tmpRoot: root }));
    } catch {
      send(404, { error: `PDF not found at stored file_path: ${entry.file_path}` });
      return;
    }
    send(201, await convertAndInsertManual(entry, fields, "llama"));
  } catch (error) {
    send(500, { ok: false, error: String(error?.message || error) });
  }
}

/**
 * Dashboard conversion endpoint: convert one staged manual-upload PDF to
 * JSON with the selected engine ("llama" direct, "react" agentic loop) and
 * insert the Oracle tables. Both engines read the same staged file.
 */
async function handleConvert(req, res, send) {
  let fields;
  try {
    fields = await readJsonBody(req);
  } catch {
    send(400, { error: "Request body must be JSON." });
    return;
  }
  const fileId = Number(fields.fileId);
  if (!Number.isInteger(fileId)) {
    send(400, { error: "fileId is required." });
    return;
  }
  if (fields.mode !== "llama" && fields.mode !== "react") {
    send(400, { error: "mode must be 'llama' or 'react'." });
    return;
  }
  try {
    const entry = await findRegistryEntryOrThrow(fileId);
    try {
      await stat(entryAbsolutePath(entry, { rootDir: root, tmpRoot: root }));
    } catch {
      send(404, { error: `PDF not found at stored file_path: ${entry.file_path}` });
      return;
    }
    const maxAttempts = Number(fields.maxAttempts) || 3;
    send(201, await convertAndInsertManual(entry, fields, fields.mode, maxAttempts));
  } catch (error) {
    send(500, { ok: false, error: String(error?.message || error) });
  }
}

/**
 * WhatsApp receive: accepts one PDF (raw body, metadata in X- headers),
 * stages it under files/Whatsapp/, and inserts the file_details +
 * invoice_header + invoice_lines rows. The sender rarely supplies structured
 * data, so the row is low-confidence (Exception) for payables review.
 * Wire a WhatsApp Business / Twilio media webhook to forward here.
 */
async function handleWhatsappMessage(req, res, send) {
  const originalName = decodeURIComponent(req.headers["x-file-name"] || "invoice.pdf");
  if (!/\.pdf$/i.test(originalName)) {
    send(400, { error: "Only PDF files can be received." });
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      send(413, { error: "File is too large. The limit is 10 MB." });
      return;
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (!isPdfBuffer(buffer)) {
    send(400, { error: "The received file is not a valid PDF." });
    return;
  }

  const whatsappDir = path.join(root, "files", "Whatsapp");
  await mkdir(whatsappDir, { recursive: true });
  const stamp = Date.now();
  const storedName = storedWhatsappNameFor(originalName, stamp);
  const filePath = `files/Whatsapp/${storedName}`;
  await writeFile(path.join(whatsappDir, storedName), buffer);

  const registryPath = path.join(root, "files", "file-details.json");
  const registry = await readJson("files/file-details.json").catch(() => []);
  const entry = {
    file_id: nextFileId(registry),
    file_name: storedName,
    file_path: filePath,
    message_id: decodeURIComponent(req.headers["x-message-id"] || "") || null,
    status: "A",
    invoice_id: null,
    invoice_number: null,
    original_file_name: originalName,
    source: "WhatsApp",
  };
  registry.push(entry);
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  // Same shared PDF-to-JSON conversion as Gmail and Manual Upload, reading
  // the staged file from files/Whatsapp/. The Dashboard engine toggle picks
  // the ReAct loop ("react" via X-Engine header or ?mode=) or direct llama;
  // a failed extraction falls back to low-confidence defaults so the
  // receipt is never lost.
  const url = new URL(req.url || "/", "http://localhost");
  const engine = decodeURIComponent(req.headers["x-engine"] || "") || url.searchParams.get("mode") || "llama";
  const sender = decodeURIComponent(req.headers["x-sender"] || "");
  const caption = decodeURIComponent(req.headers["x-caption"] || "");
  let draft;
  let extracted = false;
  let activeEngine = "llama";
  try {
    const schemaText = await readInvoiceSchema();
    const converted = await convertWithEngine(buffer, {
      filename: originalName,
      llamaSchemaText: schemaText,
      emailContext: `WhatsApp sender: ${sender || ""}\nCaption: ${caption || ""}`,
      fallback: { messageId: entry.message_id, vendorName: sender },
      engine,
    });
    draft = converted.draft;
    activeEngine = converted.engine;
    if (sender && (!draft.vendorName || draft.vendorName === "Unknown vendor")) {
      draft.vendorName = sender;
    }
    extracted = true;
  } catch {
    draft = whatsappFallbackDraft({ sender, messageId: entry.message_id, caption, stamp });
  }
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    const stored = await insertDraft(
      connection,
      draft,
      {
        storedName: entry.file_name,
        originalName: entry.file_name,
        filePath: entry.file_path,
        fileSizeBytes: buffer.length,
        messageId: entry.message_id,
        channel: "WhatsApp",
        createdBy: "WHATSAPP_SYNC",
        fallbackDescription: caption || draft.invoiceNumber,
      },
    );
    await connection.commit();
    send(201, {
      fileId: entry.file_id,
      fileName: entry.file_name,
      filePath: entry.file_path,
      ...stored,
      db: { saved: true },
      extracted,
      engine: activeEngine,
    });
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    send(201, {
      fileId: entry.file_id,
      fileName: entry.file_name,
      filePath: entry.file_path,
      db: { saved: false, error: String(error?.message || error) },
      extracted,
      engine: activeEngine,
    });
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors.
    }
  }
}

/**
 * ERP pickup: queue one Approved invoice_header row in erp_invoice_queue
 * so the Oracle ERP integration can create the ERP invoice from it.
 */
async function handleErpEnqueue(req, res, send) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) {
      send(413, { error: "Request is too large." });
      return;
    }
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    send(400, { error: "Request body must be JSON." });
    return;
  }
  const headerId = Number(body.headerId);
  if (!Number.isInteger(headerId)) {
    send(400, { error: "headerId is required." });
    return;
  }
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    const stored = await enqueueForErp(connection, headerId, {
      erpSystem: typeof body.erpSystem === "string" ? body.erpSystem : "",
      createdBy: "SIRE",
    });
    await connection.commit();
    send(stored.status === "already-queued" ? 200 : 201, { ok: true, ...stored });
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    send(400, { ok: false, error: String(error?.message || error) });
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors.
    }
  }
}

/**
 * Mark-ready: promote qualifying headers to Ready without user intervention.
 */
async function handleMarkReady(req, res, send) {
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    const result = await markReadyInvoices(connection, { createdBy: "SIRE" });
    await connection.commit();
    send(200, { ok: true, ...result });
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    send(500, { ok: false, error: String(error?.message || error) });
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors.
    }
  }
}

/**
 * Live approve/reject: record the decision on the Oracle header, notify
 * Payables Manager, and auto-queue approvals for ERP pickup.
 */
async function handleReviewDecision(req, res, send) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) {
      send(413, { error: "Request is too large." });
      return;
    }
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    send(400, { error: "Request body must be JSON." });
    return;
  }
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    const stored = await recordReviewDecision(connection, {
      headerId: Number(body.headerId),
      decision: body.decision,
      remarks: body.remarks,
      actionBy: typeof body.actionBy === "string" ? body.actionBy : "",
    });
    await connection.commit();
    send(200, { ok: true, ...stored });
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    send(400, { ok: false, error: String(error?.message || error) });
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors.
    }
  }
}

const server = http.createServer(async (req, res) => {
  const send = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  try {
    const pathname = req.url?.split("?")[0] ?? "";
    const pdfMatch = documentFileId(req.url) !== null;
    if (pathname === "/api/manual-uploads" && req.method === "POST") {
      await handleManualUpload(req, res, send);
    } else if (pathname === "/api/manual-invoices" && req.method === "POST") {
      await handleManualInvoiceInsert(req, res, send);
    } else if (pathname === "/api/convert" && req.method === "POST") {
      await handleConvert(req, res, send);
    } else if (pathname === "/api/erp/enqueue" && req.method === "POST") {
      await handleErpEnqueue(req, res, send);
    } else if (pathname === "/api/invoices/mark-ready" && req.method === "POST") {
      await handleMarkReady(req, res, send);
    } else if (pathname === "/api/reviews/decision" && req.method === "POST") {
      await handleReviewDecision(req, res, send);
    } else if (pdfMatch && (req.method === "GET" || req.method === "HEAD")) {
      await serveInvoicePdf(req, res, documentFileId(req.url));
    } else if (pathname === "/api/db/status") {
      send(200, await getDbStatus());
    } else if (pathname === "/api/live/data") {
      send(200, await getLiveData());
    } else if (pathname === "/api/health") {
      send(200, { ok: true, service: "sire-api" });
    } else if (pathname === "/api/sources/gmail") {
      try {
        send(200, await gmailStatus());
      } catch (error) {
        send(200, { connected: false, error: String(error?.message || error) });
      }
    } else if (pathname === "/api/sources/gmail/sync" && req.method === "POST") {
      try {
        const syncBody = await readJsonBody(req).catch(() => ({}));
        const syncMode = syncBody.mode === "react" ? "react" : "llama";
        send(200, { ok: true, ...(await syncGmailInvoices({ mode: syncMode })) });
      } catch (error) {
        send(500, { ok: false, error: String(error?.message || error) });
      }
    } else if (pathname === "/api/sources/whatsapp") {
      send(200, getWhatsAppStatus());
    } else if (pathname === "/api/sources/whatsapp/messages" && req.method === "POST") {
      await handleWhatsappMessage(req, res, send);
    } else {
      send(404, { error: "not found" });
    }
  } catch (error) {
    send(500, { error: String(error?.message || error) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SIRE API listening on http://127.0.0.1:${PORT}`);
});
