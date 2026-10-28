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
}

export function validateInvoice(
  invoice: Invoice,
  suppliers: SupplierFeedRecord[],
  projects: ProjectFeedRecord[],
): InvoiceValidation {
  const issues: string[] = [];
  const supplier = suppliers.find((record) => record.supplier === invoice.supplier);
  const project = invoice.project
    ? projects.find((record) => record.project === invoice.project)
    : undefined;

  const supplierKnown = Boolean(supplier);
  const projectKnown = Boolean(project);
  const supplierActive = supplier?.status === "Active";
  const projectActive = project?.status === "Active";

  if (!supplierKnown) {
    issues.push(
      `Supplier "${invoice.supplier}" is not present in the Suppliers screen (ERP supplier feed).`,
    );
  }
  if (!projectKnown) {
    issues.push(
      invoice.project
        ? `Project "${invoice.project}" is not present in the Projects screen (ERP project feed).`
        : "No project is recorded, so the project cannot be validated against the Projects screen.",
    );
  }

  let level: ValidationLevel = "ok";
  if (!supplierKnown || !projectKnown) {
    level = "invalid";
  } else {
    if (!supplierActive) {
      issues.push(
        `Supplier "${invoice.supplier}" is inactive in the ERP supplier feed and must be reviewed by the payables team before approving or rejecting this invoice.`,
      );
    }
    if (!projectActive) {
      issues.push(
        `Project "${invoice.project}" is inactive in the ERP project feed and must be reviewed by the payables team before approving or rejecting this invoice.`,
      );
    }
    if (!supplierActive || !projectActive) level = "review";
  }

  return { level, issues, supplierKnown, projectKnown, supplierActive, projectActive };
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
  projects: ProjectFeedRecord[],
  payablesReviewConfirmed: boolean,
): DecisionGate {
  const validation = validateInvoice(invoice, suppliers, projects);
  const reasons: string[] = [];

  if (validation.level === "invalid") {
    reasons.push(
      `This invoice must be rejected: not a valid supplier or project. Contact ${PAYABLES_CONTACT}.`,
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
