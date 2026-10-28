/**
 * Creates the SIRE schema in Oracle from Tables.sql.
 *
 * Run: npm run db:create-tables
 *
 * Reads .env from the project root and connects with the wallet
 * (DB_USER, DB_PSW, WALLET_LOC, CONFIG_DIR, DSN_ADB, WALLET_PSW).
 * Statements that fail only because the object already exists
 * (ORA-00955 / ORA-01430 / ORA-00001) are reported as "exists" so the
 * script can be re-run safely. Any other error aborts with a summary.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import oracledb from "oracledb";

import { buildDbConfig } from "../server/db-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  console.error("Could not load .env from the project root.");
  process.exit(1);
}

function splitStatements(sql) {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const ALREADY_EXISTS = new Set([955, 1430, 1, 2261, 2275, 2299]);

const sql = await readFile(path.join(root, "Tables.sql"), "utf8");
const statements = splitStatements(sql);

const config = buildDbConfig(process.env);
let connection;
const results = { created: [], existed: [], failed: [] };

try {
  connection = await oracledb.getConnection({
    user: config.user,
    password: config.password,
    connectString: config.connectString,
    configDir: config.configDir,
    walletLocation: config.walletLocation,
    walletPassword: config.walletPassword,
  });
  console.log(`Connected to Oracle as ${config.user} via ${config.connectString}`);

  for (const statement of statements) {
    const label =
      statement.match(/^(CREATE TABLE|CREATE INDEX|INSERT INTO)\s+(\w+)/i)?.[0] ||
      statement.slice(0, 60).replace(/\s+/g, " ");
    try {
      await connection.execute(statement);
      results.created.push(label);
      console.log(`OK      ${label}`);
    } catch (error) {
      if (ALREADY_EXISTS.has(error.errorNum)) {
        results.existed.push(label);
        console.log(`EXISTS  ${label}`);
      } else {
        results.failed.push({ label, error: error.message });
        console.log(`FAILED  ${label}: ${error.message}`);
      }
    }
  }
  await connection.commit();

  const tables = await connection.execute(
    `SELECT table_name FROM user_tables ORDER BY table_name`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log("\nTables now in schema:");
  for (const row of tables.rows) {
    const count = await connection.execute(
      `SELECT COUNT(*) AS CNT FROM ${row.TABLE_NAME}`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    console.log(`  ${row.TABLE_NAME}: ${count.rows[0].CNT} rows`);
  }
} finally {
  if (connection) await connection.close().catch(() => {});
}

console.log(
  `\nSummary: ${results.created.length} executed, ${results.existed.length} already existed, ${results.failed.length} failed.`,
);
if (results.failed.length > 0) process.exit(1);
