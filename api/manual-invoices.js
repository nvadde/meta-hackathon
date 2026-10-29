import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDbPool } from "../../server/db.mjs";
import { readJson, root } from "../../invoiceSource/Gmail/gmail-client.mjs";
import { entryAbsolutePath, insertManualInvoice } from "../../invoiceSource/Manual/manual-upload.mjs";
import { convertStagedPdf, mergeManualFields } from "../../invoiceSource/convert.mjs";
import { readInvoiceSchema } from "../../invoiceSource/Gmail/gmail-sync.mjs";
import { TMP_ROOT } from "./manual-uploads.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const fields = req.body && typeof req.body === "object" ? req.body : {};
  const fileId = Number(fields.fileId);
  if (!Number.isInteger(fileId)) {
    res.status(400).json({ error: "fileId is required." });
    return;
  }
  const bundled = await readJson("files/file-details.json").catch(() => []);
  const ephemeral = await readFile(path.join(TMP_ROOT, "file-details.json"), "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => []);
  const entry = [...ephemeral, ...bundled].find((item) => item.file_id === fileId);
  if (!entry) {
    res.status(404).json({ error: "No file_details record for this upload. Upload the PDF first." });
    return;
  }
  let fileSizeBytes = 0;
  try {
    fileSizeBytes = (await stat(entryAbsolutePath(entry, { rootDir: root, tmpRoot: TMP_ROOT }))).size;
  } catch {
    res.status(404).json({ error: `PDF not found at stored file_path: ${entry.file_path}` });
    return;
  }
  // Same shared PDF-to-JSON conversion as Gmail and WhatsApp, reading the
  // staged file. User-typed values always win; extraction only fills blanks.
  let effectiveFields = { ...fields };
  let extracted = false;
  let filledKeys = [];
  try {
    const schemaText = await readInvoiceSchema();
    const stagedBytes = await readFile(entryAbsolutePath(entry, { rootDir: root, tmpRoot: TMP_ROOT }));
    const { draft } = await convertStagedPdf(stagedBytes, {
      filename: entry.file_name,
      schemaText,
    });
    const merged = mergeManualFields(fields, draft);
    effectiveFields = merged.merged;
    filledKeys = merged.filledKeys;
    extracted = true;
  } catch {
    // Proceed with the user-typed values.
  }
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    const stored = await insertManualInvoice(connection, entry, { ...effectiveFields, fileSizeBytes });
    await connection.commit();
    res.status(201).json({ ok: true, ...stored, extracted, filledKeys });
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors.
    }
  }
}
