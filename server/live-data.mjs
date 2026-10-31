/** Mapping from Oracle rows (uppercase keys) to the app's data shapes. */
import { validateInvoiceDraft } from "../invoiceSource/invoice-validation.mjs";

function toIsoDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function orNull(value) {
  return value ? toIsoDate(value) : null;
}

export function mapSupplierRow(row) {
  return {
    supplier: row.SUPPLIER_NAME ?? "",
    supplierNumber: row.SUPPLIER_NUMBER ?? "",
    status: row.STATUS === "Inactive" ? "Inactive" : "Active",
    startDate: toIsoDate(row.START_DATE),
    endDate: orNull(row.END_DATE),
    site: row.SUPPLIER_SITE ?? "",
    address: row.SUPPLIER_ADDRESS ?? "",
  };
}

export function mapProjectRow(row) {
  return {
    project: row.PROJECT_NAME ?? "",
    projectNumber: row.PROJECT_NUMBER ?? "",
    status: row.STATUS === "Inactive" ? "Inactive" : "Active",
    startDate: toIsoDate(row.START_DATE),
    endDate: orNull(row.END_DATE),
    address: row.PROJECT_ADDRESS ?? "",
  };
}

/**
 * Normalize INVOICE_SOURCE to the app's channel list. Oracle rows may carry
 * any casing or the legacy "Upload"/"Manual" shorthand. When the stored
 * source is missing or unrecognized, the channel is inferred from the
 * file_details path (files/<Channel>/... or gmail-/whatsapp-/manual-
 * filename prefixes); anything else falls back to Manual Upload so the
 * workbench always shows a real channel badge.
 */
export function normalizeSource(value, filePath = "") {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "gmail") return "Gmail";
  if (text === "whatsapp" || text === "whats app") return "WhatsApp";
  if (text === "manual upload" || text === "manual" || text === "upload") return "Manual Upload";
  const pathText = String(filePath ?? "").toLowerCase();
  if (pathText.includes("/gmail/") || pathText.includes("gmail-")) return "Gmail";
  if (pathText.includes("/whatsapp/") || pathText.includes("whatsapp-")) return "WhatsApp";
  if (pathText.includes("/manual/") || pathText.includes("manual-")) return "Manual Upload";
  return "Manual Upload";
}
const KNOWN_STATUSES = new Set([
  "Received",
  "Processing",
  "Matched",
  "Exception",
  "Ready",
  "Approved",
  "Rejected",
]);

export function invoiceTypeOf(value) {
  return String(value ?? "").trim().toLowerCase() === "credit memo" ? "Credit memo" : "Standard";
}

/**
 * Re-derive validation messages for stored rows (no schema change):
 * masters are raw supplier_master/project_master rows. Without masters
 * the list stays empty and only the stored type is reported.
 */
/**
 * Synthetic invoice numbers minted when extraction missed the real one:
 * GMAIL- plus the 8 trailing chars of the message id or timestamp.
 * Real supplier numbers essentially never take this shape.
 */
const SYNTHETIC_NUMBER = /^GMAIL-[0-9a-f]{8}$/i;

export function exceptionMessagesFor(row, lines, masters = null, opts = {}) {
  if (!masters) return [];
  const draft = {
    invoiceNumber: row.INVOICE_NUMBER ?? "",
    invoiceNumberFromFallback: SYNTHETIC_NUMBER.test(String(row.INVOICE_NUMBER ?? "")),
    vendorName: row.SUPPLIER_NAME ?? row.VENDOR_NAME ?? "",
    supplierNumber: row.SUPPLIER_NUMBER ?? "",
    amountDue: row.AMOUNT_DUE,
    amountInvalid: row.AMOUNT_DUE === null || row.AMOUNT_DUE === undefined,
    projectNumber: row.PROJECT_NUMBER ?? "",
    projectName: row.PROJECT_NAME ?? "",
    lines: (lines || []).map((line) => ({ amount: line.AMOUNT })),
  };
  const supplierRows = masters.supplierRows || [];
  const projectRows = masters.projectRows || [];
  const result = validateInvoiceDraft(
    draft,
    {
      suppliers: supplierRows.map((supplierRow) => ({
        name: supplierRow.SUPPLIER_NAME ?? "",
        number: supplierRow.SUPPLIER_NUMBER ?? "",
      })),
      projects: projectRows.map((projectRow) => ({
        name: projectRow.PROJECT_NAME ?? "",
        number: projectRow.PROJECT_NUMBER ?? "",
      })),
      invoices: Array.isArray(opts.invoices) ? opts.invoices : [],
    },
    { excludeHeaderId: opts.excludeHeaderId ?? null },
  );
  return result.messages;
}

export function mapInvoiceRows(headerRows, lineRows, masters = null, queueByHeader = new Map()) {
  const linesByHeader = new Map();
  for (const line of lineRows) {
    const list = linesByHeader.get(line.HEADER_ID) || [];
    list.push({
      lineNum: String(line.LINE_NUM ?? list.length + 1),
      description: line.DESCRIPTION ?? line.NAME ?? "",
      quantity: Number(line.QUANTITY ?? 0),
      units: line.UNITS ?? "ea",
      unitPrice: Number(line.UNIT_PRICE ?? 0),
      amount: Number(line.AMOUNT ?? 0),
    });
    linesByHeader.set(line.HEADER_ID, list);
  }

  const storedInvoices = headerRows.map((headerRow) => ({
    headerId: headerRow.HEADER_ID,
    invoiceNumber: headerRow.INVOICE_NUMBER ?? "",
    supplierId: headerRow.SUPPLIER_ID ?? null,
    vendorName: headerRow.SUPPLIER_NAME ?? headerRow.VENDOR_NAME ?? "",
    status: headerRow.PROCESSING_STATUS ?? "",
  }));

  return headerRows.map((row) => {
    const lines = linesByHeader.get(row.HEADER_ID) || [];
    return {
      id: `db-${row.HEADER_ID}`,
      fileId: Number(row.FILE_ID ?? 0),
      fileName: row.FILE_NAME ?? "",
      filePath: row.FILE_PATH ?? "",
      invoiceNumber: row.INVOICE_NUMBER ?? "",
      supplier: row.SUPPLIER_NAME ?? row.VENDOR_NAME ?? "",
      supplierNumber: row.SUPPLIER_NUMBER ?? "",
      project: row.PROJECT_NAME ?? "",
      projectNumber: row.PROJECT_NUMBER ?? "",
      jobNumber: row.JOB_NUMBER ?? "",
      source: normalizeSource(row.INVOICE_SOURCE, row.FILE_PATH),
      receivedDate: toIsoDate(row.RECEIVED_DATE || row.INVOICE_DATE),
      invoiceDate: toIsoDate(row.INVOICE_DATE),
      amount: Number(row.AMOUNT_DUE ?? 0),
      currency: row.INVOICE_CURRENCY ?? "USD",
      status: KNOWN_STATUSES.has(row.PROCESSING_STATUS) ? row.PROCESSING_STATUS : "Received",
      invoiceType: invoiceTypeOf(row.INVOICE_TYPE),
      remittanceAddress: row.REMITTANCE_ADDRESS ?? "",
      billToAddress: row.BILL_TO ?? row.CUSTOMER_ADDRESS ?? "",
      exceptionCount: Number(row.EXCEPTION_COUNT ?? 0),
      exceptionMessages: exceptionMessagesFor(row, lineRows.filter((line) => line.HEADER_ID === row.HEADER_ID), masters, { invoices: storedInvoices, excludeHeaderId: row.HEADER_ID }),
      payablesReviewConfirmed: row.PAYABLES_REVIEW_CONFIRMED === "Y",
      queueStatus: queueByHeader.get(row.HEADER_ID)?.queueStatus ?? null,
      erpInvoiceId: queueByHeader.get(row.HEADER_ID)?.erpInvoiceId ?? null,
      lines,
    };
  });
}
