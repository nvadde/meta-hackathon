import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDbPool } from "../../../server/db.mjs";
import { isPdfBuffer, nextFileId } from "../../../invoiceSource/Manual/manual-upload.mjs";
import {
  storedWhatsappNameFor,
  whatsappFallbackDraft,
} from "../../../invoiceSource/Whatsapp/whatsapp.mjs";
import { convertWithEngine } from "../../../invoiceSource/convert.mjs";
import { insertDraft, readInvoiceSchema } from "../../../invoiceSource/Gmail/gmail-sync.mjs";
import { TMP_ROOT } from "../manual-uploads.js";

// Vercel's filesystem is ephemeral: uploads live in /tmp and do not survive
// redeploys or scale-out. Vercel Blob is needed for durable storage.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const originalName = decodeURIComponent(req.headers["x-file-name"] || "invoice.pdf");
  if (!/\.pdf$/i.test(originalName)) {
    res.status(400).json({ error: "Only PDF files can be received." });
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: "File is too large. The limit is 10 MB." });
      return;
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (!isPdfBuffer(buffer)) {
    res.status(400).json({ error: "The received file is not a valid PDF." });
    return;
  }

  const whatsappDir = path.join(TMP_ROOT, "whatsapp");
  await mkdir(whatsappDir, { recursive: true });
  const stamp = Date.now();
  const storedName = storedWhatsappNameFor(originalName, stamp);
  await writeFile(path.join(whatsappDir, storedName), buffer);

  const registryPath = path.join(TMP_ROOT, "file-details.json");
  const registry = await readFile(registryPath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => []);
  const entry = {
    file_id: nextFileId(registry),
    file_name: storedName,
    file_path: `tmp/whatsapp/${storedName}`,
    message_id: decodeURIComponent(req.headers["x-message-id"] || "") || null,
    status: "A",
    invoice_id: null,
    invoice_number: null,
    original_file_name: originalName,
    source: "WhatsApp",
  };
  registry.push(entry);
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  // Same shared PDF-to-JSON conversion as Gmail and Manual Upload.
  // The engine toggle picks the ReAct loop ("react" via X-Engine header or
  // ?mode=) or direct llama; a failed extraction falls back to
  // low-confidence defaults.
  const engine = decodeURIComponent(req.headers["x-engine"] || "") || req.query.mode || "llama";
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
    res.status(201).json({
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
    res.status(201).json({
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
