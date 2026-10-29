/** Mapping from Oracle rows (uppercase keys) to the app's data shapes. */

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

export function mapInvoiceRows(headerRows, lineRows) {
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

  return headerRows.map((row) => ({
    id: `db-${row.HEADER_ID}`,
    fileId: Number(row.FILE_ID ?? 0),
    fileName: row.FILE_NAME ?? "",
    filePath: row.FILE_PATH ?? "",
    invoiceNumber: row.INVOICE_NUMBER ?? "",
    supplier: row.SUPPLIER_NAME ?? row.VENDOR_NAME ?? "",
    project: row.PROJECT_NAME ?? "",
    projectNumber: row.PROJECT_NUMBER ?? "",
    jobNumber: row.JOB_NUMBER ?? "",
    source: normalizeSource(row.INVOICE_SOURCE, row.FILE_PATH),
    receivedDate: toIsoDate(row.RECEIVED_DATE || row.INVOICE_DATE),
    invoiceDate: toIsoDate(row.INVOICE_DATE),
    amount: Number(row.AMOUNT_DUE ?? 0),
    currency: row.INVOICE_CURRENCY ?? "USD",
    status: KNOWN_STATUSES.has(row.PROCESSING_STATUS) ? row.PROCESSING_STATUS : "Received",
    remittanceAddress: row.REMITTANCE_ADDRESS ?? "",
    billToAddress: row.BILL_TO ?? row.CUSTOMER_ADDRESS ?? "",
    exceptionCount: Number(row.EXCEPTION_COUNT ?? 0),
    payablesReviewConfirmed: row.PAYABLES_REVIEW_CONFIRMED === "Y",
    lines: linesByHeader.get(row.HEADER_ID) || [],
  }));
}
