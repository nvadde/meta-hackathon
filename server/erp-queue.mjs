/**
 * ERP pickup queue. Approved invoice_header rows are queued here so the
 * Oracle ERP integration can pick them up (QUEUED -> PROCESSING -> CREATED),
 * create the ERP invoice, and store its reference back. Nothing is posted
 * to the ERP from this repo; the queue table is the handoff contract.
 */
import oracledb from "oracledb";

import { insertAdaptive, nextId } from "../invoiceSource/Gmail/gmail-sync.mjs";

export async function enqueueForErp(connection, headerId, { erpSystem = "", createdBy = "SIRE" } = {}) {
  if (!Number.isInteger(headerId)) {
    throw new Error("enqueueForErp: headerId must be an integer.");
  }
  const headerResult = await connection.execute(
    "SELECT header_id, processing_status FROM invoice_header WHERE header_id = :0",
    [headerId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const header = (headerResult.rows || [])[0];
  if (!header) {
    throw new Error(`enqueueForErp: no invoice_header row for header_id ${headerId}.`);
  }
  if (header.PROCESSING_STATUS !== "Approved" && header.PROCESSING_STATUS !== "Ready") {
    throw new Error(
      `enqueueForErp: only Ready or Approved headers can be queued (header ${headerId} is ${header.PROCESSING_STATUS || "unknown"}).`,
    );
  }
  const queueResult = await connection.execute(
    "SELECT queue_id, queue_status FROM erp_invoice_queue WHERE header_id = :0",
    [headerId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const existing = (queueResult.rows || [])[0];
  if (existing) {
    return { status: "already-queued", headerId, queueId: existing.QUEUE_ID, queueStatus: existing.QUEUE_STATUS };
  }
  const suppliedQueueId = await nextId(connection, "ERP_INVOICE_QUEUE", "QUEUE_ID");
  const queueId =
    (await insertAdaptive(
      connection,
      "ERP_INVOICE_QUEUE",
      [
        ["QUEUE_ID", suppliedQueueId],
        ["HEADER_ID", headerId],
        ["QUEUE_STATUS", "QUEUED"],
        ["QUEUED_DATE", new Date()],
        ["ERP_SYSTEM", erpSystem || null],
        ["ATTEMPT_COUNT", 0],
        ["CREATION_DATE", new Date()],
        ["CREATED_BY", createdBy],
      ],
      "QUEUE_ID",
      ["QUEUE_ID", "HEADER_ID"],
    )) ?? suppliedQueueId;
  return { status: "queued", headerId, queueId };
}
