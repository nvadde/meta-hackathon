/**
 * Live review decisions. Records an approve/reject on an Oracle
 * invoice_header row, logs it in invoice_review_action, notifies the
 * Payables Manager via the notification table (both outcomes), and
 * auto-queues approvals in erp_invoice_queue for ERP pickup.
 */
import oracledb from "oracledb";

import { insertAdaptive, nextId } from "../invoiceSource/Gmail/gmail-sync.mjs";
import { enqueueForErp } from "./erp-queue.mjs";

const PAYABLES_MANAGER = "Payables Manager";

export async function recordReviewDecision(connection, { headerId, decision, remarks, actionBy = "" }) {
  if (!Number.isInteger(headerId)) {
    throw new Error("recordReviewDecision: headerId must be an integer.");
  }
  const verb = String(decision || "").trim().toLowerCase();
  if (verb !== "approve" && verb !== "reject") {
    throw new Error("recordReviewDecision: decision must be 'approve' or 'reject'.");
  }
  if (!String(remarks || "").trim()) {
    throw new Error("recordReviewDecision: remarks/comments are required.");
  }
  const headerResult = await connection.execute(
    "SELECT header_id, invoice_number, processing_status FROM invoice_header WHERE header_id = :0",
    [headerId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const header = (headerResult.rows || [])[0];
  if (!header) {
    throw new Error(`recordReviewDecision: no invoice_header row for header_id ${headerId}.`);
  }
  const oldStatus = header.PROCESSING_STATUS;
  if (oldStatus === "Approved" || oldStatus === "Rejected") {
    throw new Error(`recordReviewDecision: header ${headerId} is already ${oldStatus}.`);
  }
  const newStatus = verb === "approve" ? "Approved" : "Rejected";
  const actionType = verb === "approve" ? "APPROVE" : "REJECT";
  const cleanRemarks = String(remarks).trim();

  await connection.execute("UPDATE invoice_header SET processing_status = :0 WHERE header_id = :1", [
    newStatus,
    headerId,
  ]);

  const suppliedActionId = await nextId(connection, "INVOICE_REVIEW_ACTION", "ACTION_ID");
  const actionId =
    (await insertAdaptive(
      connection,
      "INVOICE_REVIEW_ACTION",
      [
        ["ACTION_ID", suppliedActionId],
        ["HEADER_ID", headerId],
        ["ACTION_TYPE", actionType],
        ["ACTION_BY", actionBy || null],
        ["OLD_STATUS", oldStatus],
        ["NEW_STATUS", newStatus],
        ["REMARKS", cleanRemarks],
        ["CHANGE_TEXT", `Processing status: ${oldStatus} → ${newStatus}`],
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
        ["NOTIFICATION_TYPE", verb === "approve" ? "INVOICE_APPROVED" : "INVOICE_REJECTED"],
        ["RECIPIENT_ROLE", PAYABLES_MANAGER],
        ["SUBJECT", `Invoice ${header.INVOICE_NUMBER} ${verb === "approve" ? "approved" : "rejected"}`],
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

  const queued =
    verb === "approve" ? await enqueueForErp(connection, headerId, { createdBy: actionBy || "SIRE" }) : null;
  return {
    headerId,
    invoiceNumber: header.INVOICE_NUMBER,
    oldStatus,
    newStatus,
    actionId,
    notificationId,
    queued,
  };
}
