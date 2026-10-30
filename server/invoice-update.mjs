/**
 * Live invoice edits. Updates an Oracle invoice_header row plus its
 * invoice_lines, records the change in invoice_review_action (EDIT), and
 * notifies the Payables Manager via the notification table (INVOICE_UPDATED).
 *
 * Only non-final headers can be edited (anything but Approved/Rejected).
 * Processing status is owned by the approve/reject flow and is never
 * changed here.
 */
import oracledb from "oracledb";

import { insertAdaptive, nextId } from "../invoiceSource/Gmail/gmail-sync.mjs";

const EDITABLE_COLUMNS = [
  "JOB_NUMBER",
  "INVOICE_SOURCE",
  "RECEIVED_DATE",
  "INVOICE_DATE",
  "AMOUNT_DUE",
  "INVOICE_CURRENCY",
  "REMITTANCE_ADDRESS",
  "CUSTOMER_ADDRESS",
  "PROCESSING_STATUS",
  "EXCEPTION_COUNT",
];

/** Manual status moves allowed here. Approved/Rejected must go through the decision flow. */
const EDITABLE_STATUSES = ["Received", "Processing", "Matched", "Exception", "Ready"];

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fmtAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value ?? "");
}

/**
 * Validate the edit payload. Throws on the first problem so the caller
 * reports it without touching the database.
 */
export function validateUpdateFields(fields = {}) {
  const problems = [];
  if (fields.amount !== undefined && !Number.isFinite(Number(fields.amount))) {
    problems.push("Header amount must be a number.");
  }
  if (fields.exceptionCount !== undefined) {
    const count = Number(fields.exceptionCount);
    if (!Number.isInteger(count) || count < 0) {
      problems.push("Exception count must be a whole number, 0 or more.");
    }
  }
  const lines = Array.isArray(fields.lines) ? fields.lines : null;
  if (lines) {
    lines.forEach((line, index) => {
      if (!String(line?.description ?? "").trim()) {
        problems.push(`Line ${index + 1}: description is required.`);
      }
      if (!Number.isFinite(Number(line?.quantity))) {
        problems.push(`Line ${index + 1}: quantity must be a number.`);
      }
      if (!Number.isFinite(Number(line?.amount))) {
        problems.push(`Line ${index + 1}: amount must be a number.`);
      }
    });
  }
  return problems;
}

function lineTotal(lines) {
  return lines.reduce((sum, line) => sum + (Number(line.AMOUNT) || 0), 0);
}

/**
 * Next INVOICE_LINES id from the schema sequence. MAX()+1 lets two
 * concurrent sessions compute the same id and deadlock on the unique
 * index (ORA-12860); the sequence never hands out the same value twice.
 * Falls back to MAX()+1 on older tables where the sequence is missing.
 */
async function nextLineId(connection) {
  try {
    const result = await connection.execute(
      "SELECT inv_line_seq.NEXTVAL AS NEXT_ID FROM DUAL",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return result.rows?.[0]?.NEXT_ID;
  } catch (error) {
    if (!/ORA-02289/i.test(String(error?.message || ""))) throw error;
    return nextId(connection, "INVOICE_LINES", "LINE_ID");
  }
}

export async function updateLiveInvoice(
  connection,
  headerId,
  fields = {},
  { actionBy = "", remarks = "" } = {},
) {
  if (!Number.isInteger(headerId)) {
    throw new Error("updateLiveInvoice: headerId must be an integer.");
  }
  if (!String(remarks || "").trim()) {
    throw new Error("updateLiveInvoice: remarks/comments are required (sent to Payables Manager).");
  }
  const problems = validateUpdateFields(fields);
  if (problems.length > 0) {
    throw new Error(`updateLiveInvoice: ${problems.join(" ")}`);
  }

  // Lock the parent row up front so concurrent edits of the same invoice
  // serialize here (one waits) instead of deadlocking later across the
  // header update + lines DELETE/INSERT (ORA-00060/ORA-12860).
  const headerResult = await connection.execute(
    `SELECT header_id, invoice_number, supplier_name, vendor_name, job_number,
            invoice_source, received_date, invoice_date, amount_due, invoice_currency,
            processing_status, remittance_address, customer_address AS bill_to,
            exception_count, payables_review_confirmed
       FROM invoice_header WHERE header_id = :0 FOR UPDATE`,
    [headerId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const old = (headerResult.rows || [])[0];
  if (!old) {
    throw new Error(`updateLiveInvoice: no invoice_header row for header_id ${headerId}.`);
  }
  if (old.PROCESSING_STATUS === "Approved" || old.PROCESSING_STATUS === "Rejected") {
    throw new Error(`updateLiveInvoice: header ${headerId} is already ${old.PROCESSING_STATUS}.`);
  }
  const newStatus =
    fields.status !== undefined ? String(fields.status ?? "") : old.PROCESSING_STATUS;
  if (newStatus !== old.PROCESSING_STATUS) {
    if (newStatus === "Approved" || newStatus === "Rejected") {
      throw new Error(
        "updateLiveInvoice: use the approve/reject decision for Approved or Rejected.",
      );
    }
    if (!EDITABLE_STATUSES.includes(newStatus)) {
      throw new Error(`updateLiveInvoice: status '${newStatus}' is not editable.`);
    }
  }

  const oldLinesResult = await connection.execute(
    `SELECT description, quantity, units, unit_price, amount
       FROM invoice_lines WHERE header_id = :0 ORDER BY line_num`,
    [headerId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const oldLines = oldLinesResult.rows || [];

  const cleanRemarks = String(remarks).trim();
  const updated = {
    JOB_NUMBER: fields.jobNumber !== undefined ? String(fields.jobNumber ?? "") : old.JOB_NUMBER,
    INVOICE_SOURCE:
      fields.source !== undefined ? String(fields.source ?? "") : old.INVOICE_SOURCE,
    RECEIVED_DATE:
      fields.receivedDate !== undefined ? toDate(fields.receivedDate) : old.RECEIVED_DATE,
    INVOICE_DATE: fields.invoiceDate !== undefined ? toDate(fields.invoiceDate) : old.INVOICE_DATE,
    AMOUNT_DUE: fields.amount !== undefined ? Number(fields.amount) : Number(old.AMOUNT_DUE ?? 0),
    INVOICE_CURRENCY:
      fields.currency !== undefined ? String(fields.currency ?? "") : old.INVOICE_CURRENCY,
    REMITTANCE_ADDRESS:
      fields.remittanceAddress !== undefined ? String(fields.remittanceAddress ?? "") : old.REMITTANCE_ADDRESS,
    CUSTOMER_ADDRESS:
      fields.billToAddress !== undefined ? String(fields.billToAddress ?? "") : old.BILL_TO,
    PROCESSING_STATUS: newStatus,
    EXCEPTION_COUNT:
      fields.exceptionCount !== undefined ? Number(fields.exceptionCount) : Number(old.EXCEPTION_COUNT ?? 0),
  };
  const payablesConfirmed =
    fields.payablesReviewConfirmed !== undefined
      ? Boolean(fields.payablesReviewConfirmed)
      : old.PAYABLES_REVIEW_CONFIRMED === "Y";

  const changes = [];
  const describe = (label, from, to, format = (value) => String(value ?? "")) => {
    if (format(from) !== format(to)) changes.push(`${label}: ${format(from)} → ${format(to)}`);
  };
  describe("Job number", old.JOB_NUMBER, updated.JOB_NUMBER);
  describe("Source channel", old.INVOICE_SOURCE, updated.INVOICE_SOURCE);
  describe("Received date", old.RECEIVED_DATE, updated.RECEIVED_DATE, (value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? ""),
  );
  describe("Invoice date", old.INVOICE_DATE, updated.INVOICE_DATE, (value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? ""),
  );
  describe("Amount", old.AMOUNT_DUE, updated.AMOUNT_DUE, (value) => fmtAmount(value));
  describe("Currency", old.INVOICE_CURRENCY, updated.INVOICE_CURRENCY);
  describe("Remittance address", old.REMITTANCE_ADDRESS, updated.REMITTANCE_ADDRESS);
  describe("Bill To address", old.BILL_TO, updated.CUSTOMER_ADDRESS);
  describe("Processing status", old.PROCESSING_STATUS, updated.PROCESSING_STATUS);
  describe("Exception count", old.EXCEPTION_COUNT, updated.EXCEPTION_COUNT, (value) =>
    String(Number(value ?? 0)),
  );
  if (payablesConfirmed && old.PAYABLES_REVIEW_CONFIRMED !== "Y") {
    changes.push("Payables team review confirmed");
  }

  const newLines = Array.isArray(fields.lines)
    ? fields.lines.map((line, index) => ({
        description: String(line.description ?? "").trim(),
        quantity: Number(line.quantity),
        units: String(line.units ?? "ea").trim() || "ea",
        unitPrice:
          Number(line.quantity) !== 0
            ? Number(line.amount) / Number(line.quantity)
            : Number(line.unitPrice ?? line.amount),
        amount: Number(line.amount),
        lineNum: String(index + 1),
      }))
    : null;
  // Skip the DELETE + re-INSERT entirely when the lines are unchanged:
  // fewer locks held means a smaller deadlock window with other sessions.
  const normLine = (line) =>
    [line.DESCRIPTION, line.QUANTITY, line.UNITS, line.UNIT_PRICE, line.AMOUNT]
      .map((value) => String(value ?? ""))
      .join("|");
  const linesChanged =
    newLines !== null &&
    (newLines.length !== oldLines.length ||
      newLines.some(
        (line, index) =>
          normLine({
            DESCRIPTION: line.description,
            QUANTITY: line.quantity,
            UNITS: line.units,
            UNIT_PRICE: line.unitPrice,
            AMOUNT: line.amount,
          }) !== normLine(oldLines[index] || {}),
      ));
  if (newLines) {
    const before = `${oldLines.length} line(s), total ${fmtAmount(lineTotal(oldLines))}`;
    const afterTotal = newLines.reduce((sum, line) => sum + line.amount, 0);
    const after = `${newLines.length} line(s), total ${fmtAmount(afterTotal)}`;
    if (linesChanged) {
      changes.push(`Lines updated: ${before} → ${after}`);
    }
  }

  const sets = Object.keys(updated).map((column, index) => `${column} = :${index}`);
  // Every placeholder occurrence needs its own index: the driver counts
  // occurrences, not unique names, so :${sets.length} must not repeat.
  const confirmedIndex = sets.length;
  const confirmedCheckIndex = sets.length + 1;
  const auditIndex = sets.length + 2;
  const whereAuditIndex = sets.length + 3;
  const wherePlainIndex = sets.length + 2;
  const yn = payablesConfirmed ? "Y" : "N";
  const updateHeader = (withAudit) =>
    connection.execute(
      `UPDATE invoice_header SET ${sets.join(", ")},
        payables_review_confirmed = :${confirmedIndex},
        payables_review_date = CASE WHEN :${confirmedCheckIndex} = 'Y' THEN SYSDATE ELSE payables_review_date END${
        withAudit
          ? `,
        updated_date = SYSDATE, updated_by = :${auditIndex}`
          : ""
      }
        WHERE header_id = :${withAudit ? whereAuditIndex : wherePlainIndex}`,
      withAudit
        ? [...Object.values(updated), yn, yn, actionBy || "SIRE", headerId]
        : [...Object.values(updated), yn, yn, headerId],
    );
  try {
    await updateHeader(true);
  } catch (error) {
    // Older tables may lack updated_date/updated_by: retry without them.
    if (!/ORA-00904/i.test(String(error?.message || ""))) throw error;
    await updateHeader(false);
  }

  if (newLines && linesChanged) {
    await connection.execute("DELETE FROM invoice_lines WHERE header_id = :0", [headerId]);
    for (const line of newLines) {
      const lineId = await nextLineId(connection);
      await insertAdaptive(
        connection,
        "INVOICE_LINES",
        [
          ["LINE_ID", lineId],
          ["HEADER_ID", headerId],
          ["LINE_NUM", line.lineNum],
          ["NAME", old.SUPPLIER_NAME || old.VENDOR_NAME || ""],
          ["PRODUCT_CODE", null],
          ["DESCRIPTION", line.description],
          ["QUANTITY", line.quantity],
          ["UNITS", line.units],
          ["UNIT_PRICE", line.unitPrice],
          ["AMOUNT", line.amount],
          ["CREATION_DATE", new Date()],
          ["CREATED_BY", actionBy || "SIRE"],
        ],
        "LINE_ID",
        ["LINE_ID", "HEADER_ID"],
      );
    }
  }

  const suppliedActionId = await nextId(connection, "INVOICE_REVIEW_ACTION", "ACTION_ID");
  const actionId =
    (await insertAdaptive(
      connection,
      "INVOICE_REVIEW_ACTION",
      [
        ["ACTION_ID", suppliedActionId],
        ["HEADER_ID", headerId],
        ["ACTION_TYPE", "EDIT"],
        ["ACTION_BY", actionBy || null],
        ["OLD_STATUS", old.PROCESSING_STATUS],
        ["NEW_STATUS", newStatus],
        ["REMARKS", cleanRemarks],
        ["CHANGE_TEXT", changes.length > 0 ? changes.join("; ") : "No field changes"],
        ["CREATION_DATE", new Date()],
        ["CREATED_BY", actionBy || "SIRE"],
      ],
      "ACTION_ID",
      ["ACTION_ID", "HEADER_ID"],
    )) ?? suppliedActionId;

  const suppliedNotificationId = await nextId(connection, "NOTIFICATION", "NOTIFICATION_ID");
  const notificationId =
    (await insertAdaptive(
      connection,
      "NOTIFICATION",
      [
        ["NOTIFICATION_ID", suppliedNotificationId],
        ["HEADER_ID", headerId],
        ["NOTIFICATION_TYPE", "INVOICE_UPDATED"],
        ["RECIPIENT_ROLE", "Payables Manager"],
        ["SUBJECT", `Invoice ${old.INVOICE_NUMBER} updated`],
        ["REMARKS", cleanRemarks],
        ["IS_READ", "N"],
        ["DELIVERY_CHANNEL", "IN_APP"],
        ["DELIVERY_STATUS", "PENDING"],
        ["CREATION_DATE", new Date()],
        ["CREATED_BY", actionBy || "SIRE"],
      ],
      "NOTIFICATION_ID",
      ["NOTIFICATION_ID"],
    )) ?? suppliedNotificationId;

  await connection.commit();
  return {
    headerId,
    invoiceNumber: old.INVOICE_NUMBER,
    oldStatus: old.PROCESSING_STATUS,
    newStatus,
    changes,
    actionId,
    notificationId,
  };
}
