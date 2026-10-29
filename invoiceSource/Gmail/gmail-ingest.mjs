/** Gmail invoice ingest helpers. Pure functions so they can be unit-tested. */

export function listPdfAttachments(message) {
  const parts = message?.payload?.parts || [];
  const found = [];
  const walk = (nodes) => {
    for (const part of nodes || []) {
      if (part?.mimeType === "application/pdf" && part?.body?.attachmentId) {
        found.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename || "invoice.pdf",
          size: part.body.size || 0,
        });
      }
      if (part?.parts) walk(part.parts);
    }
  };
  walk(parts);
  // Single-part message carrying a PDF body directly.
  if (found.length === 0 && message?.payload?.mimeType === "application/pdf") {
    const body = message.payload.body || {};
    if (body.attachmentId) {
      found.push({
        attachmentId: body.attachmentId,
        filename: message.payload.filename || "invoice.pdf",
        size: body.size || 0,
      });
    }
  }
  return found;
}

export function headerValue(headers, name) {
  const found = (headers || []).find(
    (h) => h?.name?.toLowerCase() === String(name).toLowerCase(),
  );
  return found?.value || "";
}

/** Build the Llama prompt from email context for one attachment. */
export function buildLlamaPrompt({ subject, from, date, snippet, filename }) {
  return [
    "Extract one vendor invoice as JSON. Reply with JSON only, no markdown.",
    'Schema: {"invoice_number": string, "vendor_name": string, "invoice_date": "YYYY-MM-DD" or "", "amount_due": number, "currency": "USD"|"EUR"|"GBP" or "", "project_number": string, "notes": string}',
    "If a field is unknown use an empty string (or 0 for amount_due).",
    `Email subject: ${subject || ""}`,
    `Email from: ${from || ""}`,
    `Email date: ${date || ""}`,
    `Email snippet: ${snippet || ""}`,
    `Attachment filename: ${filename || ""}`,
  ].join("\n");
}

function toIsoDate(value) {
  if (!value) return "";
  const d = new Date(value);
  // Unparseable model output must become empty, never a garbage string:
  // new Date(garbage) binds as Invalid Date and Oracle rejects the insert.
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Read a field that may use muse.ai dotted keys ("lineitem.Name") or plain keys. */
export function pick(data, ...names) {
  for (const name of names) {
    if (data?.[name] !== undefined && data?.[name] !== null) return data[name];
  }
  return undefined;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value, max = 300) {
  return String(value ?? "").slice(0, max);
}

/**
 * Normalize muse.ai-shaped invoice JSON (dotted lineitem.* keys) into a
 * draft matching Tables.sql. Also accepts the plain-key schema shape.
 */
export function parseMuseInvoice(data = {}, fallback = {}) {
  const rawLines = pick(data, "lineitem.Items", "lines", "items");
  const lines = Array.isArray(rawLines)
    ? rawLines.slice(0, 50).map((line, index) => ({
        lineNum: str(pick(line, "lineitem.LineNum", "line_num", "lineNum") ?? index + 1, 30),
        name: str(pick(line, "lineitem.Name", "name") ?? ""),
        productCode: str(pick(line, "lineitem.ProductCode", "product_code", "productCode") ?? ""),
        description: str(pick(line, "lineitem.Description", "description") ?? ""),
        quantity: num(pick(line, "lineitem.Quantity", "quantity")),
        units: str(pick(line, "lineitem.Unit", "units") ?? "ea", 30),
        unitPrice: num(pick(line, "lineitem.UnitPrice", "unit_price", "unitPrice")),
        amount: num(pick(line, "lineitem.Amount", "amount")),
      }))
    : [];
  const invoiceNumber =
    str(pick(data, "InvoiceId", "invoice_number", "invoiceNumber") || fallback.invoiceNumber || "", 30) ||
    `GMAIL-${String(fallback.messageId || Date.now()).slice(-8)}`;
  const vendorName = str(
    pick(data, "VendorName", "vendor_name", "vendorName") || fallback.vendorName || "Unknown vendor",
  );
  const amountDue = num(pick(data, "AmountDue", "InvoiceTotal", "amount_due", "amountDue"));
  const currency = pick(data, "Currency", "currency");
  const lowConfidence =
    !pick(data, "InvoiceId", "invoice_number", "invoiceNumber") ||
    !pick(data, "VendorName", "vendor_name", "vendorName") ||
    !(amountDue > 0);
  const notes = str(pick(data, "Notes", "notes") ?? "", 500);
  const purchaseOrder = str(pick(data, "PurchaseOrder", "purchase_order", "purchaseOrder") ?? "", 30);
  return {
    invoiceNumber,
    vendorName,
    invoiceDate: toIsoDate(pick(data, "InvoiceDate", "invoice_date", "invoiceDate")) || toIsoDate(fallback.date),
    dueDate: toIsoDate(pick(data, "DueDate", "due_date", "dueDate")),
    amountDue: amountDue > 0 ? amountDue : 0,
    currency: ["USD", "EUR", "GBP"].includes(currency) ? currency : "USD",
    projectNumber: str(pick(data, "ProjectNumber", "project_number", "projectNumber") ?? "", 30),
    jobNumber: str(pick(data, "Job", "job_number", "jobNumber") ?? "", 30),
    paymentTerms: str(pick(data, "PaymentTerm", "payment_terms", "paymentTerms") ?? "", 30),
    previousUnpaidBalance: num(pick(data, "PreviousUnpaidBalance", "previous_unpaid_balance"), 0) || null,
    totalTax: num(pick(data, "TotalTax", "total_tax", "totalTax")),
    totalVat: num(pick(data, "TotalVAT", "total_vat", "totalVat")),
    billingAddress: str(pick(data, "BillingAddress", "billing_address") ?? ""),
    billingAddressRecipient: str(pick(data, "BillingAddressRecipient", "billing_address_recipient") ?? ""),
    customerAddress: str(pick(data, "CustomerAddress", "customer_address") ?? ""),
    customerAddressRecipient: str(pick(data, "CustomerAddressRecipient", "customer_address_recipient") ?? ""),
    remittanceAddress: str(pick(data, "RemittanceAddress", "remittance_address") ?? ""),
    remittanceAddressRecipient: str(pick(data, "RemittanceAddressRecipient", "remittance_address_recipient") ?? ""),
    shippingAddress: str(pick(data, "ShippingAddress", "shipping_address") ?? ""),
    shippingAddressRecipient: str(pick(data, "ShippingAddressRecipient", "shipping_address_recipient") ?? ""),
    shippingCost: num(pick(data, "ShippingCost", "shipping_cost"), 0) || null,
    vendorAddress: str(pick(data, "VendorAddress", "vendor_address") ?? ""),
    notes: purchaseOrder && !notes.includes(purchaseOrder) ? `${notes} PO:${purchaseOrder}`.slice(0, 500) : notes,
    purchaseOrder,
    lines,
    lowConfidence,
  };
}

/** Parse and normalize the model reply into an invoice draft. */
export function parseLlamaInvoice(text, fallback = {}) {
  let data = {};
  try {
    const cleaned = String(text || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    data = start >= 0 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) : {};
  } catch {
    data = {};
  }
  // One normalizer for both shapes: muse.ai dotted keys and plain keys.
  return parseMuseInvoice(data, fallback);
}

/** Decode Gmail base64url attachment body to a Buffer. */
export function decodeAttachmentBody(data) {
  const normalized = String(data || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}
