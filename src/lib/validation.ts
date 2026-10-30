import type { Invoice } from "../data/invoices.ts";
import type { ProjectFeedRecord } from "../data/projects.ts";
import type { SupplierFeedRecord } from "../data/suppliers.ts";

export const PAYABLES_CONTACT = "payablesmanager@sire.com";

export const INVALID_SUPPLIER_PROJECT_REMARKS =
  `Not a valid supplier or project. Contact ${PAYABLES_CONTACT}`;

export type ValidationLevel = "ok" | "review" | "invalid";

export interface InvoiceValidation {
  level: ValidationLevel;
  issues: string[];
  supplierKnown: boolean;
  projectKnown: boolean;
  supplierActive: boolean;
  projectActive: boolean;
  /** True when the supplier feed was empty, so "unknown" means unverified. */
  supplierUnverified: boolean;
  /** Closest master supplier name, when the invoice supplier matched nothing. */
  supplierHint: string | null;
}

/** Smallest edit distance wins; used only to hint at typos. */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j++) grid[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return grid[a.length][b.length];
}

export function validateInvoice(
  invoice: Invoice,
  suppliers: SupplierFeedRecord[],
  // Kept for call compatibility; project is no longer validated.
  _projects: ProjectFeedRecord[],
): InvoiceValidation {
  const issues: string[] = [];
  // Same rule as the server validator: supplier matches by name only
  // (case-insensitive, internal whitespace collapsed so "OIL  SERVICE"
  // and "OIL SERVICE" compare equal).
  const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const supplier = suppliers.find((record) => {
    const name = norm(record.supplier);
    const invName = norm(invoice.supplier);
    return name !== "" && name === invName;
  });

  // Project is not validated: any project value (or none) passes.
  const projectKnown = true;
  const projectActive = true;

  const mastersEmpty = suppliers.length === 0;
  const supplierKnown = Boolean(supplier);
  const supplierActive = supplier?.status === "Active";
  const supplierUnverified = !supplierKnown && mastersEmpty;

  if (!String(invoice.invoiceNumber ?? "").trim()) {
    issues.push("Invoice number is blank.");
  }
  if (!String(invoice.supplier ?? "").trim()) {
    issues.push("Supplier is blank.");
  }
  if (!Number.isFinite(invoice.amount) || invoice.amount === 0) {
    issues.push("Amount due is not a valid non-zero number.");
  }
  if (Array.isArray(invoice.lines) && invoice.lines.length > 0 && Number.isFinite(invoice.amount) && invoice.amount !== 0) {
    let sum = 0;
    let linesNumeric = true;
    for (const line of invoice.lines) {
      if (!Number.isFinite(line.amount)) {
        linesNumeric = false;
        break;
      }
      sum += line.amount;
    }
    if (!linesNumeric) {
      issues.push("A line amount is not numeric.");
    } else {
      const tolerance = Math.max(1, Math.abs(invoice.amount) * 0.01);
      if (Math.abs(sum - invoice.amount) > tolerance) {
        issues.push(
          `Invoice header amount ${invoice.amount.toFixed(2)} does not match the lines total ${sum.toFixed(2)}.`,
        );
      }
    }
  }

  let supplierHint: string | null = null;
  if (!supplierKnown && !mastersEmpty) {
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const record of suppliers) {
      const name = String(record.supplier ?? "").trim();
      if (!name) continue;
      const distance = levenshtein(norm(name), norm(invoice.supplier));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = name;
      }
    }
    supplierHint = best;
  }
  if (!supplierKnown) {
    issues.push(
      mastersEmpty
        ? `Supplier "${invoice.supplier}" cannot be confirmed: the supplier masters did not load. Confirm the payables team review to proceed.`
        : `Supplier "${invoice.supplier}" is not present in the Suppliers screen (ERP supplier feed).` +
          (supplierHint ? ` Closest match: "${supplierHint}".` : ""),
    );
  }

  const structuralIssue = issues.some(
    (issue) =>
      issue === "Invoice number is blank." ||
      issue === "Supplier is blank." ||
      issue === "Amount due is not a valid non-zero number." ||
      issue === "A line amount is not numeric." ||
      issue.includes("does not match the lines total"),
  );
  let level: ValidationLevel = "ok";
  if (!supplierKnown || structuralIssue) {
    level = "invalid";
  } else {
    if (!supplierActive) {
      issues.push(
        `Supplier "${invoice.supplier}" is inactive in the ERP supplier feed and must be reviewed by the payables team before approving or rejecting this invoice.`,
      );
    }
    if (!supplierActive) level = "review";
  }

  return { level, issues, supplierKnown, projectKnown, supplierActive, projectActive, supplierUnverified, supplierHint };
}

export interface DecisionGate {
  canApprove: boolean;
  canReject: boolean;
  reasons: string[];
}

/**
 * Whether Approve / Reject may proceed, based only on supplier/project
 * validation. The detail screen also applies its existing checks
 * (exceptions resolved and lines matching the header amount for approval).
 */
export function decisionGate(
  invoice: Invoice,
  suppliers: SupplierFeedRecord[],
  // Kept for call compatibility; project is no longer validated.
  _projects: ProjectFeedRecord[],
  payablesReviewConfirmed: boolean,
): DecisionGate {
  const validation = validateInvoice(invoice, suppliers, _projects);
  const reasons: string[] = [];

  if (validation.level === "invalid") {
    if (payablesReviewConfirmed || invoice.payablesReviewConfirmed) {
      reasons.push(
        "Payables team review confirmed: approval is allowed even though validation failed.",
      );
      return { canApprove: true, canReject: true, reasons };
    }
    reasons.push(
      validation.supplierUnverified
        ? `The supplier masters did not load, so "${invoice.supplier}" cannot be confirmed. Confirm the payables team review to approve after review.`
        : `This invoice must be rejected: not a valid supplier. Contact ${PAYABLES_CONTACT}.` +
          (validation.supplierHint ? ` Closest match: "${validation.supplierHint}".` : ""),
    );
    return { canApprove: false, canReject: true, reasons };
  }

  if (validation.level === "review" && !payablesReviewConfirmed && !invoice.payablesReviewConfirmed) {
    reasons.push(
      "This invoice must be reviewed by the payables team before approving or rejecting it. Confirm the payables team review to continue.",
    );
    return { canApprove: false, canReject: false, reasons };
  }

  return { canApprove: true, canReject: true, reasons };
}
