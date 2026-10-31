/**
 * Simulated ERP consumer for the published view.
 *
 * Approved invoices are "published": any ERP (none is configured inside
 * SIRE) picks a QUEUED erp_invoice_queue row up, creates the ERP invoice,
 * and writes back CREATED + its own invoice reference (or FAILED + reason).
 * This module is the SIRE side of that handoff contract: list the
 * approved-only published rows, claim one QUEUED row (first claim wins),
 * and record the consumer's write-back. A local simulator script
 * (scripts/erp-consumer.mjs) plays the consumer role; no ERP system is
 * configured, contacted, or stored here.
 */
import oracledb from "oracledb";

function clean(value) {
  return String(value ?? "").trim();
}

/**
 * Approved-only published rows with their pickup state. Exception (and any
 * other non-approved) invoices never appear here by construction.
 */
export async function getPublishedInvoices(connection) {
  const result = await connection.execute(
    `SELECT h.header_id, h.invoice_number, h.supplier_name, h.vendor_name,
            h.project_number, h.amount_due, h.invoice_currency, h.processing_status,
            q.queue_status, q.erp_invoice_id, q.erp_system, q.last_error, q.processed_date
       FROM invoice_header h
       LEFT JOIN erp_invoice_queue q ON q.header_id = h.header_id
      WHERE h.processing_status = 'Approved'
      ORDER BY h.header_id DESC`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows || []).map((row) => ({
    headerId: row.HEADER_ID,
    invoiceNumber: row.INVOICE_NUMBER ?? "",
    supplier: row.SUPPLIER_NAME ?? row.VENDOR_NAME ?? "",
    projectNumber: row.PROJECT_NUMBER ?? "",
    amountDue: Number(row.AMOUNT_DUE ?? 0),
    currency: row.INVOICE_CURRENCY ?? "USD",
    status: row.PROCESSING_STATUS ?? "Approved",
    queueStatus: row.QUEUE_STATUS ?? null,
    erpInvoiceId: row.ERP_INVOICE_ID ?? null,
    erpSystem: row.ERP_SYSTEM ?? null,
    lastError: row.LAST_ERROR ?? null,
    processedDate: row.PROCESSED_DATE ? new Date(row.PROCESSED_DATE).toISOString() : null,
  }));
}

/**
 * Claim one QUEUED row for pickup. The UPDATE only matches QUEUED rows, so
 * concurrent consumers cannot double-claim: the first claim wins and later
 * claims fail loudly.
 */
export async function claimForErp(connection, headerId, { consumer = "", createdBy = "SIRE" } = {}) {
  if (!Number.isInteger(headerId)) {
    throw new Error("claimForErp: headerId must be an integer.");
  }
  const result = await connection.execute(
    `UPDATE erp_invoice_queue
        SET queue_status = 'PROCESSING',
            attempt_count = NVL(attempt_count, 0) + 1,
            erp_system = CASE WHEN :consumer = '' THEN erp_system ELSE :consumer END,
            updated_date = :now,
            updated_by = :by
      WHERE header_id = :headerId AND queue_status = 'QUEUED'`,
    {
      consumer: clean(consumer),
      now: new Date(),
      by: createdBy,
      headerId,
    },
    { autoCommit: false },
  );
  if ((result.rowsAffected ?? 0) !== 1) {
    throw new Error(
      `claimForErp: no QUEUED erp_invoice_queue row for header ${headerId} (already claimed or not queued; first claim wins).`,
    );
  }
  return { status: "claimed", headerId, queueStatus: "PROCESSING" };
}

/**
 * Record the consumer's write-back. CREATED stores the ERP's own invoice
 * reference; FAILED stores the reason. Only a claimed (PROCESSING) row can
 * be written back.
 */
export async function writeBackErp(
  connection,
  headerId,
  { outcome = "", erpInvoiceId = "", reason = "", createdBy = "SIRE" } = {},
) {
  if (!Number.isInteger(headerId)) {
    throw new Error("writeBackErp: headerId must be an integer.");
  }
  const verb = clean(outcome).toUpperCase();
  if (verb !== "CREATED" && verb !== "FAILED") {
    throw new Error("writeBackErp: outcome must be 'CREATED' or 'FAILED'.");
  }
  const reference = clean(erpInvoiceId);
  if (verb === "CREATED" && !reference) {
    throw new Error("writeBackErp: erpInvoiceId is required when outcome is 'CREATED'.");
  }
  const result = await connection.execute(
    `UPDATE erp_invoice_queue
        SET queue_status = :status,
            erp_invoice_id = CASE WHEN :status = 'CREATED' THEN :reference ELSE erp_invoice_id END,
            last_error = CASE WHEN :status = 'FAILED' THEN :reason ELSE NULL END,
            processed_date = :now,
            updated_date = :now,
            updated_by = :by
      WHERE header_id = :headerId AND queue_status = 'PROCESSING'`,
    {
      status: verb,
      reference: reference || null,
      reason: clean(reason) || null,
      now: new Date(),
      by: createdBy,
      headerId,
    },
    { autoCommit: false },
  );
  if ((result.rowsAffected ?? 0) !== 1) {
    throw new Error(
      `writeBackErp: no PROCESSING erp_invoice_queue row for header ${headerId} (claim it first).`,
    );
  }
  return { status: verb === "CREATED" ? "created" : "failed", headerId, queueStatus: verb };
}
