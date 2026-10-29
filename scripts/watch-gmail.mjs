/**
 * Watch loop: poll Gmail for new PDF invoices and import them into Oracle.
 *
 * Run: npm run watch:gmail [-- --interval 60 --max 5 --label "SIRE/Processed" --mode react]
 *
 * Each pass runs the same sync as POST /api/sources/gmail/sync: new PDF
 * invoices are extracted with Muse Spark, inserted into Oracle, and moved
 * to the processed label (archived from INBOX). Already-processed mail is
 * excluded by the Gmail search itself, so idle passes are cheap.
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

function flagValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const intervalSeconds = Math.max(15, Number(flagValue("--interval", "60")) || 60);
const maxMessages = Number(flagValue("--max", "5")) || 5;
const processedLabel = flagValue("--label", "SIRE/Processed");
const engineMode = flagValue("--mode", "llama") === "react" ? "react" : "llama";

const { syncGmailInvoices } = await import("../invoiceSource/Gmail/gmail-sync.mjs");
const { closeDbPool } = await import("../server/db.mjs");

let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
  console.log("\nStopping watch loop…");
});

console.log(
  `Watching Gmail every ${intervalSeconds}s (max ${maxMessages}/pass, label "${processedLabel}"). Ctrl+C to stop.`,
);
while (!stopped) {
  try {
    const summary = await syncGmailInvoices({ maxMessages, processedLabel, mode: engineMode });
    console.log(`[${new Date().toISOString()}]`, JSON.stringify(summary));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] sync failed: ${error?.message || error}`);
  }
  for (let waited = 0; waited < intervalSeconds && !stopped; waited += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
await closeDbPool();
