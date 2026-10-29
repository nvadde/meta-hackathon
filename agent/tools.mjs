/**
 * Tools for the ReAct invoice agent. Pure functions so they can be unit-tested;
 * the model call itself is injected by the caller (see react-agent.mjs).
 */

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Lightweight PDF peek: size plus an approximate page count. No PDF library. */
export function readPdfMeta(buffer) {
  const text = Buffer.from(buffer).toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
  return { bytes: buffer.length, pages };
}

export function buildExtractionPrompt({ schemaText, attempt, priorErrors }) {
  const lines = [
    "Read the attached invoice PDF and return one JSON object using the InvoiceSchema keys.",
    "Reply with JSON only, no markdown, no extra text.",
    "If a field is unknown use an empty string (or 0 for numbers).",
    `Schema: ${schemaText}`,
  ];
  if (attempt > 1 && priorErrors.length > 0) {
    lines.push(
      "Previous attempt failed validation. Fix these problems and return the full corrected object:",
      ...priorErrors.map((error) => `- ${error}`),
    );
  }
  return lines.join("\n");
}

/** Parse model output that may be wrapped in fences or prose. */
export function parseModelJson(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

function invoiceNumberOf(data) {
  return data.InvoiceId ?? data.invoice_number ?? data.invoiceNumber ?? data.InvoiceNumber ?? "";
}

function vendorOf(data) {
  return data.VendorName ?? data.vendor_name ?? data.vendorName ?? "";
}

function amountOf(data) {
  return num(data.AmountDue ?? data.InvoiceTotal ?? data.amount_due ?? data.amountDue);
}

function itemsOf(data) {
  const raw = data.Items ?? data.items ?? data["lineitem.Items"] ?? data.lines ?? [];
  return Array.isArray(raw) ? raw : [];
}

function itemAmountOf(item) {
  return num(item.Amount ?? item.amount ?? item["lineitem.Amount"]);
}

/**
 * Validate an extracted object against the InvoiceSchema expectations.
 * Totals must reconcile: sum(line amounts) within max(1, 1%) of the header.
 */
export function validateExtraction(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["Model did not return a JSON object."] };
  }
  if (!String(invoiceNumberOf(data) ?? "").trim()) errors.push("Missing invoice number (InvoiceId).");
  if (!String(vendorOf(data) ?? "").trim()) errors.push("Missing vendor name (VendorName).");
  const total = amountOf(data);
  if (total === null || total <= 0) errors.push("Missing or non-positive header total (AmountDue).");
  const items = itemsOf(data);
  if (items.length === 0) {
    errors.push("Missing line items (Items).");
  } else {
    let sum = 0;
    items.forEach((item, index) => {
      const amount = itemAmountOf(item);
      if (amount === null) errors.push(`Line ${index + 1}: amount is not a number.`);
      else sum += amount;
    });
    if (total !== null && total > 0 && errors.length === 0) {
      const tolerance = Math.max(1, Math.abs(total) * 0.01);
      if (Math.abs(sum - total) > tolerance) {
        errors.push(
          `Lines total ${sum.toFixed(2)} differs from header total ${total.toFixed(2)} by more than ${tolerance.toFixed(2)}.`,
        );
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
