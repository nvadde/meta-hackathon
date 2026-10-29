import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { getDbPool } from "../../server/db.mjs";
import { resolveDocumentEntry } from "../../server/file-document.mjs";
import { readJson, root } from "../../invoiceSource/Gmail/gmail-client.mjs";
import { TMP_ROOT } from "../manual-uploads.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const fileId = Number(req.query.fileId);
  if (!Number.isInteger(fileId)) {
    res.status(400).json({ error: "invalid file id" });
    return;
  }
  const bundled = await readJson("files/file-details.json").catch(() => []);
  const ephemeral = await readFile(path.join(TMP_ROOT, "file-details.json"), "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => []);
  const resolved = await resolveDocumentEntry(fileId, {
    registry: [...ephemeral, ...bundled],
    getConnection: async () => (await getDbPool()).getConnection(),
    preferOracle: req.query.scope === "live",
  });
  const entry = resolved?.entry;
  if (!entry) {
    res.status(404).json({ error: "No file_details record for this invoice" });
    return;
  }
  const candidates = entry.file_path.startsWith("tmp/")
    ? [path.join(TMP_ROOT, entry.file_path.slice(4))]
    : [path.resolve(root, entry.file_path)];
  const filesRoot = entry.file_path.startsWith("tmp") ? TMP_ROOT : path.join(root, "files");
  const absolute = candidates[0];
  if (!absolute.startsWith(filesRoot) || !absolute.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "Stored file_path is not a PDF under files/" });
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
    res.status(404).json({ error: `PDF not found at stored file_path: ${entry.file_path}` });
  }
}
