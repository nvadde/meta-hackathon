/**
 * CLI: Gmail -> Meta Model API -> Oracle invoice sync.
 *
 * Run: npm run sync:gmail
 *
 * Needs .env (Oracle wallet keys + MODEL_API_KEY), plus
 * credentials.json / token.json (Google OAuth) in the project root.
 * Inserts file_details + invoice_header (+1 line) rows for Gmail PDFs;
 * the dashboard Live (Oracle) view then shows them.
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

const { syncGmailInvoices } = await import("../invoiceSource/Gmail/gmail-sync.mjs");
const { closeDbPool } = await import("../server/db.mjs");

const modeFlag = process.argv.indexOf("--mode");
const mode = modeFlag >= 0 && process.argv[modeFlag + 1] === "react" ? "react" : "llama";

try {
  const summary = await syncGmailInvoices({ maxMessages: 5, mode });
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(`Sync failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await closeDbPool();
}
