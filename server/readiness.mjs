/**
 * Automatic Ready marking. Invoice headers that meet every condition without
 * user intervention — known active supplier and project, zero exceptions,
 * and lines reconciling to the header total — move from Received/Processing/
 * Matched to Ready so the ERP queue can pick them up. Anything else stays
 * for human review. Each promotion is recorded in invoice_review_action.
 */
import oracledb from "oracledb";

import { insertAdaptive, nextId } from "../invoiceSource/Gmail/gmail-sync.mjs";

const ELIGIBLE_STATUSES = ["Received", "Processing", "Matched"];

export async function findReadyCandidates(connection) {
  const headerResult = await connection.execute(
    `SELECT h.header_id, h.invoice_number, h.supplier_name, h.vendor_name,
            h.project_number, h.amount_due, h.exception_count, h.processing_status
       FROM invoice_header h
      WHERE h.processing_status IN (${ELIGIBLE_STATUSES.map((_, i) => `:${i}`).join(", ")})
        AND NVL(h.exception_count, 0) = 0`,
    [...ELIGIBLE_STATUSES],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const headers = headerResult.rows || [];
  if (headers.length === 0) return { examined: 0, candidates: [] };
  const supplierResult = await connection.execute(
    "SELECT supplier_name, status FROM supplier_master",
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const activeSuppliers = new Set(
    (supplierResult.rows || [])
      .filter((row) => (row.STATUS || "Active") === "Active")
      .map((row) => String(row.SUPPLIER_NAME || "").toLowerCase()),
  );
  const projectResult = await connection.execute(
    "SELECT project_number, status FROM project_master",
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const activeProjects = new Set(
    (projectResult.rows || [])
      .filter((row) => (row.STATUS || "Active") === "Active")
      .map((row) => String(row.PROJECT_NUMBER || "").toLowerCase()),
  );
  const ids = headers.map((row) => row.HEADER_ID);
  const lineResult = await connection.execute(
    `SELECT header_id, SUM(amount) AS line_total FROM invoice_lines
      WHERE header_id IN (${ids.map((_, i) => `:${i}`).join(", ")}) GROUP BY header_id`,
    ids,
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const totals = new Map((lineResult.rows || []).map((row) => [row.HEADER_ID, Number(row.LINE_TOTAL ?? 0)]));
  const candidates = headers.filter((row) => {
    const supplier = String(row.SUPPLIER_NAME || row.VENDOR_NAME || "").toLowerCase();
    const project = String(row.PROJECT_NUMBER || "").toLowerCase();
    if (!activeSuppliers.has(supplier)) return false;
    if (!activeProjects.has(project)) return false;
    const total = Number(row.AMOUNT_DUE ?? 0);
    const lines = totals.get(row.HEADER_ID);
    if (lines === undefined) return false;
    return Math.abs(lines - total) < 0.005;
  });
  return { examined: headers.length, candidates };
}

export async function markReadyInvoices(connection, { createdBy = "SIRE" } = {}) {
  const { examined, candidates } = await findReadyCandidates(connection);
  const marked = [];
  for (const row of candidates) {
    await connection.execute(
      "UPDATE invoice_header SET processing_status = 'Ready' WHERE header_id = :0",
      [row.HEADER_ID],
    );
    const actionId = await nextId(connection, "INVOICE_REVIEW_ACTION", "ACTION_ID");
    await insertAdaptive(
      connection,
      "INVOICE_REVIEW_ACTION",
      [
        ["ACTION_ID", actionId],
        ["HEADER_ID", row.HEADER_ID],
        ["ACTION_TYPE", "EDIT"],
        ["ACTION_BY", createdBy],
        ["OLD_STATUS", row.PROCESSING_STATUS],
        ["NEW_STATUS", "Ready"],
        ["REMARKS", "Automatically marked Ready: active supplier/project, no exceptions, lines reconcile."],
        ["CHANGE_TEXT", `Processing status: ${row.PROCESSING_STATUS} → Ready (automatic)`],
        ["CREATION_DATE", new Date()],
        ["CREATED_BY", createdBy],
      ],
      "ACTION_ID",
      ["ACTION_ID", "HEADER_ID"],
    );
    marked.push({ headerId: row.HEADER_ID, invoiceNumber: row.INVOICE_NUMBER });
  }
  return { checked: examined, marked };
}
