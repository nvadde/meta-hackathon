import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { readJson, root } from "../../invoiceSource/Gmail/gmail-client.mjs";
import { isPdfBuffer, nextFileId, storedFileNameFor } from "../../invoiceSource/Manual/manual-upload.mjs";

// Vercel's filesystem is ephemeral: uploads live in /tmp and do not survive
// redeploys or scale-out. Use Vercel Blob for durable storage later.
const TMP_ROOT = path.join("/tmp", "sire-files");

async function tmpRegistry() {
  const registryPath = path.join(TMP_ROOT, "file-details.json");
  try {
    return JSON.parse(await readFile(registryPath, "utf8"));
  } catch {
    const seed = await readJson("files/file-details.json").catch(() => []);
    await mkdir(TMP_ROOT, { recursive: true });
    await writeFile(registryPath, `${JSON.stringify(seed, null, 2)}\n`);
    return seed;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const originalName = decodeURIComponent(req.headers["x-file-name"] || "invoice.pdf");
  if (!/\.pdf$/i.test(originalName)) {
    res.status(400).json({ error: "Only PDF files can be uploaded." });
    return;
  }
  const chunks = [];
  let size = 0;
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
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
    res.status(400).json({ error: "The uploaded file is not a valid PDF." });
    return;
  }

  const invoicesDir = path.join(TMP_ROOT, "manual");
  await mkdir(invoicesDir, { recursive: true });
  const storedName = storedFileNameFor(originalName, Date.now()).replace(/^manual-/, "tmp-");
  await writeFile(path.join(invoicesDir, storedName), buffer);

  const registry = await tmpRegistry();
  const entry = {
    file_id: nextFileId(registry),
    file_name: storedName,
    file_path: `tmp/manual/${storedName}`,
    message_id: null,
    status: "A",
    invoice_id: null,
    invoice_number: null,
    original_file_name: originalName,
    source: "Manual Upload (ephemeral)",
  };
  registry.push(entry);
  await writeFile(path.join(TMP_ROOT, "file-details.json"), `${JSON.stringify(registry, null, 2)}\n`);

  res.status(201).json({
    fileId: entry.file_id,
    fileName: entry.file_name,
    filePath: entry.file_path,
    originalFileName: originalName,
    size: buffer.length,
  });
}

export { TMP_ROOT };
