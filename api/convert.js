import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { getDbPool } from "../../server/db.mjs";
import { readJson, root } from "../../invoiceSource/Gmail/gmail-client.mjs";
import { readInvoiceSchema } from "../../invoiceSource/Gmail/gmail-sync.mjs";
import { entryAbsolutePath, insertManualFromConversion } from "../../invoiceSource/Manual/manual-upload.mjs";
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
  if (fields.mode !== "llama" && fields.mode !== "react") {
    res.status(400).json({ error: "mode must be 'llama' or 'react'." });
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
  const absolute = entryAbsolutePath(entry, { rootDir: root, tmpRoot: TMP_ROOT });
  try {
    await stat(absolute);
  } catch {
    res.status(404).json({ error: `PDF not found at stored file_path: ${entry.file_path}` });
    return;
  }
  let connection;
  try {
    const stagedBytes = await readFile(absolute);
    const schemaText = await readInvoiceSchema();
    const fileSizeBytes = (await stat(absolute)).size;
    connection = await (await getDbPool()).getConnection();
    const result = await insertManualFromConversion(connection, entry, {
      mode: fields.mode,
      userFields: fields,
      fileSizeBytes,
      schemaText,
      stagedBytes,
      maxAttempts: Number(fields.maxAttempts) || 3,
    });
    await connection.commit();
    res.status(201).json({
      ok: true,
      mode: fields.mode,
      ...result.stored,
      extracted: result.extracted,
      filledKeys: result.filledKeys,
      ...(result.attempts === undefined ? {} : { attempts: result.attempts }),
    });
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
