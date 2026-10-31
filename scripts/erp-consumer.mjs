/**
 * CLI: simulated ERP consumer for the published view.
 *
 * This script plays the consumer role against the local SIRE backend: it
 * claims one QUEUED erp_invoice_queue row (first claim wins) and writes
 * back CREATED with a locally minted ERP reference (or FAILED with a
 * reason via --fail). It contacts only SIRE's own API — no ERP system is
 * configured, contacted, or stored anywhere.
 *
 * Run: npm run erp:consume -- <header-id> [--consumer SIM] [--fail "reason"]
 *      npm run erp:consume -- --next [--consumer SIM]   (claims oldest QUEUED row)
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
const { claimForErp, getPublishedInvoices, writeBackErp } = await import("../server/erp-consumer.mjs");

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
};
const consumer = flag("--consumer") || "SIM";
const failReason = args.includes("--fail") ? flag("--fail") || "Simulated consumer failure." : null;
let headerId = Number(args.find((arg) => !arg.startsWith("--") && arg !== consumer && arg !== failReason));

try {
  const pool = await getDbPool();
  const connection = await pool.getConnection();
  try {
    if (args.includes("--next") || !Number.isInteger(headerId)) {
      const published = await getPublishedInvoices(connection);
      const next = published.find((row) => row.queueStatus === "QUEUED");
      if (!next) {
        console.log(JSON.stringify({ ok: true, status: "nothing-queued" }, null, 2));
        process.exitCode = 0;
        return;
      }
      headerId = next.headerId;
    }
    const claimed = await claimForErp(connection, headerId, { consumer, createdBy: "SIRE" });
    await connection.commit();
    console.log(JSON.stringify({ ok: true, ...claimed, headerId }, null, 2));
    const written = failReason
      ? await writeBackErp(connection, headerId, { outcome: "FAILED", reason: failReason, createdBy: "SIRE" })
      : await writeBackErp(connection, headerId, {
          outcome: "CREATED",
          erpInvoiceId: `ERP-${headerId}-${Date.now().toString().slice(-6)}`,
          createdBy: "SIRE",
        });
    await connection.commit();
    console.log(JSON.stringify({ ok: true, ...written }, null, 2));
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
  console.error(`Consume failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await closeDbPool();
}
