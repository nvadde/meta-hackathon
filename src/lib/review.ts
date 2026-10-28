import type { Invoice } from "../data/invoices.ts";
import { projectFeed, type ProjectFeedRecord } from "../data/projects.ts";
import { supplierFeed, type SupplierFeedRecord } from "../data/suppliers.ts";
import { formatAmount } from "./format.ts";
import { validateInvoice } from "./validation.ts";

export type ActionKind = "needs-review" | "edited" | "approved";

export interface MyActionItem {
  invoice: Invoice;
  kinds: ActionKind[];
}

export interface ChangeEntry {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  supplier: string;
  at: string;
  changes: string[];
}

export interface ApprovalNotification {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  supplier: string;
  to: "Payables Manager";
  type: "Invoice approved";
  remarks: string;
  at: string;
  read: boolean;
}

export const APPROVAL_RECIPIENT = "Payables Manager" as const;

export function isApprovalTransition(before: Invoice, after: Invoice): boolean {
  return before.status !== "Approved" && after.status === "Approved";
}

/**
 * Builds the Payables Manager notification for an approval.
 * Remarks/comments are mandatory: blank remarks return null.
 */
export function createApprovalNotification(
  invoice: Invoice,
  remarks: string,
  at: string,
): ApprovalNotification | null {
  const trimmed = remarks.trim();
  if (!trimmed) return null;
  return {
    id: `${at}-${invoice.id}`,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    supplier: invoice.supplier,
    to: APPROVAL_RECIPIENT,
    type: "Invoice approved",
    remarks: trimmed,
    at,
    read: false,
  };
}

const headerFields: {
  key: keyof Invoice;
  label: string;
  format?: (invoice: Invoice) => string;
}[] = [
  { key: "invoiceNumber", label: "Invoice number" },
  { key: "supplier", label: "Supplier" },
  { key: "project", label: "Project" },
  { key: "projectNumber", label: "Project number" },
  { key: "jobNumber", label: "Job number" },
  { key: "source", label: "Source channel" },
  { key: "receivedDate", label: "Received date" },
  { key: "invoiceDate", label: "Invoice date" },
  {
    key: "amount",
    label: "Amount",
    format: (invoice) => `${formatAmount(invoice.amount, invoice.currency)} ${invoice.currency}`,
  },
  { key: "currency", label: "Currency" },
  { key: "status", label: "Processing status" },
  { key: "remittanceAddress", label: "Remittance address" },
  { key: "billToAddress", label: "Bill To address" },
  { key: "exceptionCount", label: "Exception count" },
];

export function linesTotal(invoice: Invoice): number {
  return invoice.lines.reduce((sum, line) => sum + line.amount, 0);
}

export function describeInvoiceChanges(before: Invoice, after: Invoice): string[] {
  const changes: string[] = [];
  for (const field of headerFields) {
    const format = field.format ?? ((invoice: Invoice) => String(invoice[field.key]));
    const from = format(before);
    const to = format(after);
    if (from !== to) changes.push(`${field.label}: ${from} → ${to}`);
  }
  if (JSON.stringify(before.lines) !== JSON.stringify(after.lines)) {
    changes.push(
      `Lines updated: ${before.lines.length} line(s), total ${formatAmount(linesTotal(before), before.currency)} → ${after.lines.length} line(s), total ${formatAmount(linesTotal(after), after.currency)} (${after.currency})`,
    );
  }
  return changes;
}

export function deriveMyActions(
  allInvoices: Invoice[],
  editedIds: ReadonlySet<string>,
  suppliers: SupplierFeedRecord[] = supplierFeed,
  projects: ProjectFeedRecord[] = projectFeed,
): MyActionItem[] {
  const items: MyActionItem[] = [];
  for (const invoice of allInvoices) {
    const kinds: ActionKind[] = [];
    if (
      invoice.exceptionCount > 0 ||
      invoice.status === "Exception" ||
      validateInvoice(invoice, suppliers, projects).level !== "ok"
    ) {
      kinds.push("needs-review");
    }
    if (editedIds.has(invoice.id)) kinds.push("edited");
    if (invoice.status === "Approved") kinds.push("approved");
    if (kinds.length > 0) items.push({ invoice, kinds });
  }
  return items;
}

export function canApprove(invoice: Invoice): boolean {
  return (
    invoice.status !== "Approved" &&
    invoice.exceptionCount === 0 &&
    Math.abs(linesTotal(invoice) - invoice.amount) < 0.005
  );
}
