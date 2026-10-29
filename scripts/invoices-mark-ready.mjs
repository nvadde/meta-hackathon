/**
 * CLI: mark qualifying Oracle invoice headers Ready without user intervention.
 *
 * Run: npm run invoices:mark-ready
 *
 * Promotes Received/Processing/Matched headers that have an active supplier
 * and project, zero exceptions, and lines reconciling to the header total.
 * Each promotion is recorded in invoice_review_action.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  console.error("Could not load .env from the project root.");
  process.exit(1);
}

const { getDbPool, closeDbPool } = await import("../server/db.mjs");
const { markReadyInvoices } = await import("../server/readiness.mjs");

try {
  const pool = await getDbPool();
  const connection = await pool.getConnection();
  try {
    const result = await markReadyInvoices(connection, { createdBy: "SIRE" });
    await connection.commit();
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    throw error;
  } finally {
    try {
      await connection.close();
    } catch {
      // Ignore close errors.
    }
  }
} catch (error) {
  console.error(`Mark-ready failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await closeDbPool();
}
