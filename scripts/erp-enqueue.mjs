/**
 * CLI: queue one Approved invoice_header row for Oracle ERP pickup.
 *
 * Run: npm run erp:enqueue -- <header-id> [--system "Oracle Fusion"]
 *
 * Only headers with PROCESSING_STATUS = 'Approved' can be queued. Headers
 * already in erp_invoice_queue are reported without duplicating the row.
 * The ERP integration itself picks QUEUED rows up from that table.
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
const { enqueueForErp } = await import("../server/erp-queue.mjs");

const [headerArg, ...rest] = process.argv.slice(2);
const systemFlag = rest.indexOf("--system");
const headerId = Number(headerArg);
if (!Number.isInteger(headerId)) {
  console.error("Usage: npm run erp:enqueue -- <header-id> [--system \"Oracle Fusion\"]");
  process.exit(1);
}

try {
  const pool = await getDbPool();
  const connection = await pool.getConnection();
  try {
    const result = await enqueueForErp(connection, headerId, {
      erpSystem: systemFlag >= 0 ? rest[systemFlag + 1] || "" : "",
      createdBy: "SIRE",
    });
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
  console.error(`Enqueue failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await closeDbPool();
}
