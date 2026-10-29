/**
 * DB check: counts + recent Gmail invoice rows.
 *
 * Run: npm run db:check
 *
 * Read-only. Shows whether Gmail imports actually landed in Oracle and
 * what the dashboard Live view should be displaying.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import oracledb from "oracledb";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  console.error("Could not load .env from the project root.");
  process.exit(1);
}

const { getDbPool, closeDbPool } = await import("../server/db.mjs");

try {
  const pool = await getDbPool();
  const connection = await pool.getConnection();
  try {
    const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    for (const table of ["FILE_DETAILS", "INVOICE_HEADER", "INVOICE_LINES"]) {
      const count = await connection.execute(`SELECT COUNT(*) AS CNT FROM ${table}`, [], options);
      console.log(`${table}: ${count.rows?.[0]?.CNT ?? 0} rows`);
    }
    const gmailFiles = await connection.execute(
      `SELECT file_id, file_name, message_id FROM file_details WHERE message_id IS NOT NULL ORDER BY file_id DESC`,
      [],
      options,
    );
    console.log("\nfile_details with Gmail message_id:", JSON.stringify(gmailFiles.rows, null, 2));
    const headers = await connection.execute(
      `SELECT header_id, file_id, invoice_number, vendor_name, invoice_source, processing_status, amount_due
         FROM invoice_header ORDER BY header_id DESC FETCH FIRST 10 ROWS ONLY`,
      [],
      options,
    );
    console.log("\nlatest invoice_header rows:", JSON.stringify(headers.rows, null, 2));
  } finally {
    try {
      await connection.close();
    } catch {
      // Ignore close errors.
    }
  }
} catch (error) {
  console.error(`DB check failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await closeDbPool();
}
