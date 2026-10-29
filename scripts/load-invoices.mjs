/**
 * Folder loader test: convert PDFs from the channel folders (files/Gmail,
 * files/Manual, files/Whatsapp) plus the legacy files/invoices/ backlog to
 * invoiceSchema.json with the chat model and insert file_details +
 * invoice_header + invoice_lines rows. No Gmail involved.
 *
 * Run: npm run load:invoices [-- <filename.pdf> ...]
 *
 * Without arguments, loads every *.pdf in those folders that has no
 * file_details row yet (idempotent re-runs). With arguments, loads only
 * those files (re-imports even if a row exists).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  console.error("Could not load .env from the project root.");
  process.exit(1);
}

import oracledb from "oracledb";

import { getDbPool, closeDbPool } from "../server/db.mjs";
import { importPdfBuffer } from "../invoiceSource/Gmail/gmail-sync.mjs";

const only = process.argv.slice(2);
// Channel folders receive new files; files/invoices/ holds the legacy backlog
// and synthetic samples, so it is scanned too.
const sourceDirs = ["files/invoices", "files/Gmail", "files/Manual", "files/Whatsapp"];
const entries = [];
for (const dir of sourceDirs) {
  const names = await readdir(path.join(root, dir)).catch(() => []);
  for (const name of names.filter((n) => n.toLowerCase().endsWith(".pdf"))) {
    entries.push({ dir, name });
  }
}
const targets = only.length > 0 ? entries.filter(({ name }) => only.includes(name)) : entries;
if (only.length > 0 && targets.length === 0) {
  console.error(`None of ${only.join(", ")} found in ${sourceDirs.join(", ")}.`);
  process.exit(1);
}

const summary = { checked: 0, imported: 0, skipped: 0, notes: [], errors: [] };
let connection;
try {
  const pool = await getDbPool();
  connection = await pool.getConnection();
  for (const { dir, name } of targets) {
    summary.checked += 1;
    const filePath = `${dir}/${name}`;
    try {
      if (only.length === 0) {
        const existing = await connection.execute(
          "SELECT file_id FROM file_details WHERE file_path = :0",
          [filePath],
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        if ((existing.rows || []).length > 0) {
          summary.skipped += 1;
          summary.notes.push(`${name}: already loaded`);
          continue;
        }
      }
      const buffer = await readFile(path.join(root, filePath));
      const result = await importPdfBuffer(
        connection,
        {
          buffer,
          originalName: name,
          stagedName: name,
          subject: name,
        },
        { stagingDir: path.join(root, dir) },
      );
      if (result.status === "imported") summary.imported += 1;
      else {
        summary.skipped += 1;
        summary.notes.push(`${name}: ${result.reason}`);
      }
    } catch (error) {
      summary.errors.push(`${name}: ${error?.message || error}`);
    }
  }
  await connection.commit();
} catch (error) {
  try {
    await connection?.rollback();
  } catch {
    // Ignore rollback errors; report the original failure.
  }
  console.error(`Load failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  try {
    await connection?.close();
  } catch {
    // Ignore close errors.
  }
  await closeDbPool();
}
console.log(JSON.stringify(summary, null, 2));
