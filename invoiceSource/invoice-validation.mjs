/**
 * Shared invoice validation for every ingest channel (Gmail, WhatsApp,
 * Manual Upload). All channels funnel through insertDraft, which runs
 * this validation and stores the outcome on the header row:
 *
 * - invoice_type: "Standard" by default, "Credit memo" for negative totals.
 * - processing_status: "Matched" when every check passes, "Exception" with
 *   one message per failed check otherwise. New rows arrive as "Received"
 *   (the column default) and validation promotes them immediately.
 * - exception_count: number of failed checks.
 *
 * The same module re-derives the messages on the read path (live-data),
 * so the workbench can show the reason without a schema change.
 *
 * Rule values (type names, status names, tolerance, exception messages)
 * come from knowledge/validationRules.json, loaded once at import. If the
 * file is missing or unreadable the built-in defaults below apply, so
 * validation never breaks.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FALLBACK_RULES = {
  version: "built-in",
  invoiceType: { default: "Standard", creditMemoWhenAmountNegative: "Credit memo" },
  status: { initial: "Received", onValidationPass: "Matched", onValidationFail: "Exception" },
  linesTolerance: { absolute: 1, relative: 0.01 },
  checks: [
    { id: "invoice-number-present", message: "Invoice number is blank." },
    { id: "supplier-present", message: "Supplier is blank." },
    { id: "amount-valid", message: "Amount due is not a valid non-zero number." },
    { id: "supplier-match", message: "Supplier \"{value}\" does not match any supplier name or number in the ERP feed." },
    { id: "duplicate-invoice", message: "Duplicate invoice \"{value}\": the same supplier already has this invoice number on an invoice that is not Ready or Approved." },
    { id: "project-match", message: "Project \"{value}\" does not match any project name or number in the ERP feed.", blankMessage: "Project is blank: no project name or number to match against the ERP feed." },
    { id: "lines-numeric", message: "A line amount is not numeric." },
    { id: "lines-reconcile", message: "Invoice header amount {header} does not match the lines total {lines}." },
  ],
};

function checkMessage(checks, id) {
  return checks.find((check) => check.id === id) || {};
}

/** The active rulebook: knowledge/validationRules.json, or built-in defaults. */
export const validationRules = await (async () => {
  try {
    const rulesPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "knowledge",
      "validationRules.json",
    );
    return JSON.parse(await readFile(rulesPath, "utf8"));
  } catch {
    return FALLBACK_RULES;
  }
})();

const messagesFor = (id) => checkMessage(validationRules.checks || [], id);

export const INVOICE_TYPE_STANDARD =
  validationRules.invoiceType?.default ?? FALLBACK_RULES.invoiceType.default;
export const INVOICE_TYPE_CREDIT_MEMO =
  validationRules.invoiceType?.creditMemoWhenAmountNegative ??
  FALLBACK_RULES.invoiceType.creditMemoWhenAmountNegative;

export const STATUS_RECEIVED =
  validationRules.status?.initial ?? FALLBACK_RULES.status.initial;
export const STATUS_MATCHED =
  validationRules.status?.onValidationPass ?? FALLBACK_RULES.status.onValidationPass;
export const STATUS_EXCEPTION =
  validationRules.status?.onValidationFail ?? FALLBACK_RULES.status.onValidationFail;

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function finiteAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Negative header total => credit memo, anything else => standard. */
export function classifyInvoiceType(amountDue) {
  const amount = finiteAmount(amountDue);
  return amount !== null && amount < 0 ? INVOICE_TYPE_CREDIT_MEMO : INVOICE_TYPE_STANDARD;
}

/**
 * Processing statuses that close an invoice: a repeated invoice number for
 * the same supplier only fails while the earlier invoice is still pending.
 */
const FINAL_STATUSES = new Set(["ready", "approved"]);

/**
 * Validate one normalized invoice draft against the ERP masters.
 *
 * draft: { invoiceNumber, vendorName, supplierNumber, amountDue,
 *   amountInvalid, lines: [{ amount }] }
 * masters: { suppliers: [{ id, name, number }],
 *   invoices: [{ headerId, invoiceNumber, supplierId, vendorName, status }] }
 * opts: { excludeHeaderId } skips one stored row (re-validation read path).
 *
 * Supplier matches by name only (case-insensitive); project is not
 * validated. A repeated invoice number for the same supplier fails as a
 * duplicate unless every earlier copy is Ready or Approved. Returns the
 * header values to store plus the human-readable exception messages.
 */
export function validateInvoiceDraft(draft = {}, masters = {}, opts = {}) {
  const messages = [];
  const invoiceNumber = text(draft.invoiceNumber);
  const vendorName = text(draft.vendorName);
  const supplierNumber = text(draft.supplierNumber);
  const amount = finiteAmount(draft.amountDue);
  const lines = Array.isArray(draft.lines) ? draft.lines : [];

  const fill = (template, values = {}) =>
    String(template ?? "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);

  if (!invoiceNumber) messages.push(messagesFor("invoice-number-present").message);
  if (!vendorName) messages.push(messagesFor("supplier-present").message);
  if (draft.amountInvalid || amount === null || amount === 0) {
    messages.push(messagesFor("amount-valid").message);
  }

  const suppliers = Array.isArray(masters.suppliers) ? masters.suppliers : [];
  const supplierMatch =
    suppliers.find((s) => lower(s.name) && lower(s.name) === lower(vendorName)) || null;
  if (vendorName && !supplierMatch) {
    messages.push(fill(messagesFor("supplier-match").message, { value: vendorName }));
  }

  const storedInvoices = Array.isArray(masters.invoices) ? masters.invoices : [];
  const excludeHeaderId = opts.excludeHeaderId ?? null;
  if (invoiceNumber && vendorName) {
    const duplicate = storedInvoices.find((stored) => {
      if (excludeHeaderId !== null && stored.headerId === excludeHeaderId) return false;
      if (text(stored.invoiceNumber).toLowerCase() !== invoiceNumber.toLowerCase()) return false;
      const sameSupplier =
        (supplierMatch && stored.supplierId != null && stored.supplierId === supplierMatch.id) ||
        (text(stored.vendorName) !== "" && lower(stored.vendorName) === lower(vendorName));
      if (!sameSupplier) return false;
      return !FINAL_STATUSES.has(lower(stored.status));
    });
    if (duplicate) {
      messages.push(fill(messagesFor("duplicate-invoice").message, { value: invoiceNumber }));
    }
  }

  if (amount !== null && amount !== 0 && lines.length > 0) {
    let sum = 0;
    let linesNumeric = true;
    for (const line of lines) {
      const lineAmount = finiteAmount(line?.amount);
      if (lineAmount === null) {
        linesNumeric = false;
        break;
      }
      sum += lineAmount;
    }
    if (!linesNumeric) {
      messages.push(messagesFor("lines-numeric").message);
    } else {
      const toleranceCfg = validationRules.linesTolerance || {};
      const absolute = Number(toleranceCfg.absolute ?? 1);
      const relative = Number(toleranceCfg.relative ?? 0.01);
      const tolerance = Math.max(absolute, Math.abs(amount) * relative);
      if (Math.abs(sum - amount) > tolerance) {
        messages.push(
          fill(messagesFor("lines-reconcile").message, {
            header: amount.toFixed(2),
            lines: sum.toFixed(2),
          }),
        );
      }
    }
  }

  return {
    invoiceType: classifyInvoiceType(amount),
    status: messages.length === 0 ? STATUS_MATCHED : STATUS_EXCEPTION,
    exceptionCount: messages.length,
    messages,
    supplierId: supplierMatch?.id ?? null,
    projectId: null,
    supplierNumber: supplierNumber || supplierMatch?.number || "",
  };
}
