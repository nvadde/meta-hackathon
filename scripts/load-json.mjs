/**
 * Load one converted invoice JSON file into Oracle tables.
 *
 * Run: npm run load:json -- <invoice.json> [invoice.pdf]
 *
 * The JSON must use the muse.ai field shape (see files/invoiceSchema.json
 * for key descriptions). The PDF defaults to the same basename with a
 * .pdf extension and must live under files/ (files/Gmail, files/Manual,
 * files/Whatsapp, or the legacy files/invoices/) so the dashboard can
 * serve it back. Skips files that already have a file_details row.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import oracledb from "oracledb";

import { getDbPool, closeDbPool } from "../server/db.mjs";
import { parseMuseInvoice } from "../invoiceSource/Gmail/gmail-ingest.mjs";
import { insertDraft } from "../invoiceSource/Gmail/gmail-sync.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  console.error("Could not load .env from the project root.");
  process.exit(1);
}

const [jsonArg, pdfArg] = process.argv.slice(2);
if (!jsonArg) {
  console.error("Usage: npm run load:json -- <invoice.json> [invoice.pdf]");
  process.exit(1);
}
const jsonPath = path.resolve(root, jsonArg);
const pdfPath = path.resolve(root, pdfArg || jsonArg.replace(/\.json$/i, ".pdf"));
const filesDir = path.join(root, "files");
if (!pdfPath.startsWith(filesDir)) {
  console.error("The PDF must live under files/ (files/Gmail, files/Manual, files/Whatsapp) so the dashboard can serve it.");
  process.exit(1);
}
const filePath = path.relative(root, pdfPath).replace(/\\/g, "/");

const summary = { checked: 1, imported: 0, skipped: 0, errors: [] };
let connection;
try {
  const data = JSON.parse(await readFile(jsonPath, "utf8"));
  const draft = parseMuseInvoice(data, {});
  if (draft.lowConfidence) {
    throw new Error("JSON missing InvoiceId, VendorName, or a positive AmountDue/InvoiceTotal.");
  }
  const pool = await getDbPool();
  connection = await pool.getConnection();
  const existing = await connection.execute(
    "SELECT file_id FROM file_details WHERE file_path = :0",
    [filePath],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if ((existing.rows || []).length > 0) {
    summary.skipped += 1;
    console.log(JSON.stringify({ ...summary, note: `${filePath} already loaded` }, null, 2));
    process.exit(0);
  }
  const info = await stat(pdfPath);
  const stored = await insertDraft(
    connection,
    draft,
    {
      storedName: path.basename(pdfPath),
      originalName: path.basename(pdfPath),
      filePath,
      fileSizeBytes: info.size,
      messageId: null,
      channel: "Manual Upload",
      createdBy: "FILE_SYNC",
      fallbackDescription: draft.invoiceNumber,
    },
  );
  await connection.commit();
  summary.imported += 1;
  console.log(JSON.stringify({ ...summary, ...stored }, null, 2));
} catch (error) {
  try {
    await connection?.rollback();
  } catch {
    // Ignore rollback errors; report the original failure.
  }
  summary.errors.push(String(error?.message || error));
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} finally {
  try {
    await connection?.close();
  } catch {
    // Ignore close errors.
  }
  await closeDbPool();
}
