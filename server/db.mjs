/**
 * Oracle Autonomous Database connection using the wallet and .env.
 *
 * .env keys (see server/db-config.mjs): DB_USER, DB_PSW, WALLET_LOC,
 * CONFIG_DIR, DSN_ADB, WALLET_PSW. Passwords are used only to open the
 * pool and are never returned by any endpoint.
 *
 * Uses node-oracledb thin mode, which supports TCPS wallets through
 * configDir / walletLocation / walletPassword.
 */
import oracledb from "oracledb";

import { buildDbConfig } from "./db-config.mjs";
import { mapInvoiceRows, mapProjectRow, mapSupplierRow } from "./live-data.mjs";

const SIRE_TABLES = [
  "CODE_LOV",
  "SUPPLIER_MASTER",
  "PROJECT_MASTER",
  "FILE_DETAILS",
  "INVOICE_HEADER",
  "INVOICE_LINES",
  "INVOICE_REVIEW_ACTION",
  "NOTIFICATION",
  "ERP_INVOICE_QUEUE",
  "CURRENCY_RATE",
];

let poolPromise = null;

export function getDbPool(env = process.env) {
  if (!poolPromise) {
    const config = buildDbConfig(env);
    poolPromise = oracledb.createPool({
      user: config.user,
      password: config.password,
      connectString: config.connectString,
      configDir: config.configDir,
      walletLocation: config.walletLocation,
      walletPassword: config.walletPassword,
      poolMin: 1,
      poolMax: 4,
      poolIncrement: 1,
    });
    // A failed pool creation should not poison later retries.
    poolPromise.catch(() => {
      poolPromise = null;
    });
  }
  return poolPromise;
}

export async function getDbStatus(env = process.env) {
  let config;
  try {
    config = buildDbConfig(env);
  } catch (error) {
    return { connected: false, error: String(error?.message || error) };
  }

  let connection;
  try {
    const pool = await getDbPool(env);
    connection = await pool.getConnection();
    await connection.execute("SELECT 1 FROM DUAL");

    const result = await connection.execute(
      `SELECT table_name FROM user_tables WHERE table_name IN (${SIRE_TABLES.map(
        (_, index) => `:${index}`,
      ).join(", ")})`,
      SIRE_TABLES,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const presentTables = (result.rows || []).map((row) => row.TABLE_NAME).sort();
    const missingTables = SIRE_TABLES.filter((table) => !presentTables.includes(table));

    const counts = {};
    for (const table of presentTables) {
      // Table names come from the fixed SIRE_TABLES list, never user input.
      const countResult = await connection.execute(
        `SELECT COUNT(*) AS CNT FROM ${table}`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      counts[table] = countResult.rows?.[0]?.CNT ?? 0;
    }

    return {
      connected: true,
      ...config.publicSummary(),
      sireTablesPresent: presentTables,
      sireTablesMissing: missingTables,
      rowCounts: counts,
      schemaReady: missingTables.length === 0,
      note: missingTables.length
        ? "Connected to Oracle, but some SIRE tables from Tables.sql are not created yet. The app keeps using synthetic records until the schema is created and data is loaded."
        : "Connected to Oracle and all SIRE tables from Tables.sql are present.",
    };
  } catch (error) {
    return {
      connected: false,
      ...config.publicSummary(),
      error: String(error?.message || error),
      errorCode: error?.code || error?.errorNum || undefined,
    };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch {
        // Ignore close errors during status reporting.
      }
    }
  }
}

/**
 * Live data for the header Live/Sample toggle. Reads the ERP feed tables
 * and invoice tables from Oracle. Empty tables simply return empty lists;
 * the app renders clear live empty states for that case.
 */
export async function getLiveData(env = process.env) {
  let connection;
  try {
    const pool = await getDbPool(env);
    connection = await pool.getConnection();
    const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };

    const supplierResult = await connection.execute(
      `SELECT supplier_name, status, start_date, end_date, supplier_site, supplier_address
         FROM supplier_master ORDER BY supplier_name`,
      [],
      options,
    );
    const projectResult = await connection.execute(
      `SELECT project_name, project_number, status, start_date, end_date, project_address
         FROM project_master ORDER BY project_name`,
      [],
      options,
    );
    const headerResult = await connection.execute(
      `SELECT h.header_id, h.file_id, f.file_name, f.file_path,
              h.invoice_number, h.supplier_name, h.vendor_name,
              p.project_name, h.project_number, h.job_number,
              h.invoice_source, h.received_date, h.invoice_date,
              h.amount_due, h.invoice_currency, h.processing_status,
              h.remittance_address, h.customer_address AS bill_to,
              h.exception_count, h.payables_review_confirmed
         FROM invoice_header h
         LEFT JOIN file_details f ON f.file_id = h.file_id
         LEFT JOIN project_master p ON p.project_id = h.project_id
        ORDER BY NVL(h.received_date, h.invoice_date) DESC NULLS LAST, h.header_id DESC`,
      [],
      options,
    );
    const headerIds = (headerResult.rows || []).map((row) => row.HEADER_ID);
    let lineRows = [];
    if (headerIds.length > 0) {
      const binds = headerIds.map((_, index) => `:${index}`);
      const lineResult = await connection.execute(
        `SELECT header_id, line_num, description, name, quantity, units, unit_price, amount
           FROM invoice_lines WHERE header_id IN (${binds.join(", ")}) ORDER BY header_id, line_num`,
        headerIds,
        options,
      );
      lineRows = lineResult.rows || [];
    }

    return {
      connected: true,
      suppliers: (supplierResult.rows || []).map(mapSupplierRow),
      projects: (projectResult.rows || []).map(mapProjectRow),
      invoices: mapInvoiceRows(headerResult.rows || [], lineRows),
    };
  } catch (error) {
    return {
      connected: false,
      error: String(error?.message || error),
      errorCode: error?.code || error?.errorNum || undefined,
      suppliers: [],
      projects: [],
      invoices: [],
    };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch {
        // Ignore close errors.
      }
    }
  }
}

export async function closeDbPool() {
  if (!poolPromise) return;
  try {
    const pool = await poolPromise;
    await pool.close(5);
  } catch {
    // Ignore shutdown errors.
  } finally {
    poolPromise = null;
  }
}
