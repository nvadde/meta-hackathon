import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { PdfViewer } from "@/components/PdfViewer";
import { SourceBadge } from "@/components/SourceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  processingStatuses,
  type Invoice,
  type InvoiceSource,
  type ProcessingStatus,
} from "@/data/invoices";
import { formatAmount, formatDate } from "@/lib/format";
import { projectFeed as sampleProjectFeed, type ProjectFeedRecord } from "@/data/projects";
import { supplierFeed as sampleSupplierFeed, type SupplierFeedRecord } from "@/data/suppliers";
import { canApprove, linesTotal } from "@/lib/review";
import {
  INVALID_SUPPLIER_PROJECT_REMARKS,
  PAYABLES_CONTACT,
  decisionGate,
  validateInvoice,
} from "@/lib/validation";

const selectClassName =
  "h-10 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const statuses = processingStatuses;

interface LineDraft {
  lineNum: string;
  description: string;
  quantity: string;
  units: string;
  unitPrice: number;
  amount: string;
}

interface FormDraft {
  invoiceNumber: string;
  supplier: string;
  project: string;
  projectNumber: string;
  jobNumber: string;
  source: InvoiceSource;
  receivedDate: string;
  invoiceDate: string;
  amount: string;
  currency: string;
  status: ProcessingStatus;
  remittanceAddress: string;
  billToAddress: string;
  exceptionCount: string;
  lines: LineDraft[];
}

function toDraft(invoice: Invoice): FormDraft {
  return {
    invoiceNumber: invoice.invoiceNumber,
    supplier: invoice.supplier,
    project: invoice.project,
    projectNumber: invoice.projectNumber,
    jobNumber: invoice.jobNumber,
    source: invoice.source,
    receivedDate: invoice.receivedDate,
    invoiceDate: invoice.invoiceDate,
    amount: String(invoice.amount),
    currency: invoice.currency,
    status: invoice.status,
    remittanceAddress: invoice.remittanceAddress,
    billToAddress: invoice.billToAddress,
    exceptionCount: String(invoice.exceptionCount),
    lines: invoice.lines.map((line) => ({
      lineNum: line.lineNum,
      description: line.description,
      quantity: String(line.quantity),
      units: line.units,
      unitPrice: line.unitPrice,
      amount: String(line.amount),
    })),
  };
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function EditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export function InvoiceDetail({
  invoice,
  edited,
  backLabel,
  onBack,
  supplierFeed = sampleSupplierFeed,
  projectFeed = sampleProjectFeed,
  readOnly = false,
  liveDecisions = false,
  onSave,
  onApprove,
  onReject,
}: {
  invoice: Invoice;
  supplierFeed?: SupplierFeedRecord[];
  projectFeed?: ProjectFeedRecord[];
  readOnly?: boolean;
  liveDecisions?: boolean;
  edited: boolean;
  backLabel: string;
  onBack: () => void;
  onSave: (updated: Invoice, approvalRemarks?: string) => string[];
  onApprove: (
    invoice: Invoice,
    approvalRemarks: string,
    payablesReviewConfirmed: boolean,
  ) => string[] | Promise<string[]> | void;
  onReject: (
    invoice: Invoice,
    remarks: string,
    payablesReviewConfirmed: boolean,
  ) => string[] | Promise<string[]> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FormDraft>(() => toDraft(invoice));
  const [errors, setErrors] = useState<string[]>([]);
  const [savedChanges, setSavedChanges] = useState<string[]>([]);
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(Boolean(invoice.payablesReviewConfirmed));

  const total = linesTotal(invoice);
  const draftTotal = useMemo(
    () =>
      draft.lines.reduce((sum, line) => sum + (Number.isFinite(Number(line.amount)) ? Number(line.amount) : 0), 0),
    [draft.lines],
  );
  const validation = validateInvoice(invoice, supplierFeed, projectFeed);
  const gate = decisionGate(invoice, supplierFeed, projectFeed, reviewConfirmed);
  const approvable = canApprove(invoice) && gate.canApprove;
  const approveReason = invoice.status === "Approved"
    ? "This invoice is already approved."
    : invoice.exceptionCount > 0
      ? `Resolve the ${invoice.exceptionCount} exception(s) first — set Exception count to 0 when corrected — then approve.`
      : Math.abs(total - invoice.amount) >= 0.005
        ? "The lines total must equal the header amount before approval. Edit the lines or the amount so they agree."
        : null;

  function startEditing() {
    setDraft(toDraft(invoice));
    setErrors([]);
    setSavedChanges([]);
    setApprovalRemarks("");
    setApprovalError("");
    setEditing(true);
  }

  async function handleApprove() {
    if (!approvalRemarks.trim()) {
      setApprovalError("Remarks/comments are required to approve. They are sent to Payables Manager with the notification.");
      return;
    }
    setApprovalError("");
    try {
      const changes = await onApprove(invoice, approvalRemarks.trim(), reviewConfirmed);
      setSavedChanges(
        changes && changes.length > 0
          ? changes
          : [
              `Processing status: ${invoice.status} → Approved`,
              ...(validation.level === "review" ? ["Payables team review confirmed before approval"] : []),
              `Notification to Payables Manager: "${approvalRemarks.trim()}"`,
            ],
      );
      setApprovalRemarks("");
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleReject() {
    const remarks = approvalRemarks.trim() || (validation.level === "invalid" ? INVALID_SUPPLIER_PROJECT_REMARKS : "");
    if (!remarks) {
      setApprovalError("Remarks/comments are required to reject this invoice.");
      return;
    }
    setApprovalError("");
    try {
      const changes = await onReject(invoice, remarks, reviewConfirmed);
      setSavedChanges(
        changes && changes.length > 0
          ? changes
          : [
              `Processing status: ${invoice.status} → Rejected`,
              ...(validation.level === "review" ? ["Payables team review confirmed before rejection"] : []),
              `Rejection remarks: "${remarks}"`,
            ],
      );
      setApprovalRemarks("");
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : String(error));
    }
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }

  function handleSave() {
    const problems: string[] = [];
    if (!draft.invoiceNumber.trim()) problems.push("Invoice number is required.");
    if (!draft.supplier.trim()) problems.push("Supplier is required.");
    if (!draft.currency.trim()) problems.push("Currency is required.");
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount)) problems.push("Amount must be a number.");
    const exceptionCount = Number(draft.exceptionCount);
    if (!Number.isInteger(exceptionCount) || exceptionCount < 0) {
      problems.push("Exception count must be a whole number, 0 or more.");
    }
    draft.lines.forEach((line, index) => {
      if (!line.description.trim()) problems.push(`Line ${index + 1}: description is required.`);
      if (!Number.isFinite(Number(line.quantity))) problems.push(`Line ${index + 1}: quantity must be a number.`);
      if (!Number.isFinite(Number(line.amount))) problems.push(`Line ${index + 1}: amount must be a number.`);
    });
    const approving = invoice.status !== "Approved" && draft.status === "Approved";
    if (approving && !approvalRemarks.trim()) {
      problems.push(
        "Remarks/comments are required when changing the processing status to Approved. They are sent to Payables Manager with the notification.",
      );
    }
    if (approving && exceptionCount > 0) {
      problems.push("Cannot approve with exceptions outstanding. Set Exception count to 0 when they are resolved.");
    }
    if (approving && Number.isFinite(amount) && Math.abs(draftTotal - amount) >= 0.005) {
      problems.push("Cannot approve: the lines total must equal the header amount.");
    }
    const rejecting = invoice.status !== "Rejected" && draft.status === "Rejected";
    if (rejecting && !approvalRemarks.trim() && validation.level !== "invalid") {
      problems.push("Remarks/comments are required when changing the processing status to Rejected.");
    }
    if (approving && validation.level === "invalid") {
      problems.push(
        `Cannot approve: this invoice must be rejected because it is not a valid supplier or project. Contact ${PAYABLES_CONTACT}.`,
      );
    }
    if ((approving || rejecting) && validation.level === "review" && !reviewConfirmed && !invoice.payablesReviewConfirmed) {
      problems.push(
        "This invoice has an inactive supplier or project and must be reviewed by the payables team before approving or rejecting. Confirm the payables team review to save this decision.",
      );
    }
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    const updated: Invoice = {
      ...invoice,
      invoiceNumber: draft.invoiceNumber.trim(),
      supplier: draft.supplier.trim(),
      project: draft.project.trim(),
      projectNumber: draft.projectNumber.trim(),
      jobNumber: draft.jobNumber.trim(),
      source: draft.source,
      receivedDate: draft.receivedDate,
      invoiceDate: draft.invoiceDate,
      amount,
      currency: draft.currency.trim().toUpperCase(),
      status: draft.status,
      remittanceAddress: draft.remittanceAddress.trim(),
      billToAddress: draft.billToAddress.trim(),
      exceptionCount,
      payablesReviewConfirmed: reviewConfirmed || Boolean(invoice.payablesReviewConfirmed),
      lines: draft.lines.map((line, index) => ({
        lineNum: String(index + 1),
        description: line.description.trim(),
        quantity: Number(line.quantity),
        units: line.units.trim(),
        unitPrice: line.unitPrice,
        amount: Number(line.amount),
      })),
    };
    const changes = onSave(
      updated,
      approving || rejecting
        ? approvalRemarks.trim() ||
            (rejecting && validation.level === "invalid" ? INVALID_SUPPLIER_PROJECT_REMARKS : undefined)
        : undefined,
    );
    setSavedChanges(changes);
    setApprovalRemarks("");
    setErrors([]);
    setEditing(false);
  }

  return (
    <section aria-label={`Invoice ${invoice.invoiceNumber}`} className="mx-auto w-full max-w-5xl">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-2">
        <ArrowLeft aria-hidden="true" /> {backLabel}
      </Button>

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <p className="text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
          Invoice detail · synthetic record
        </p>
        {edited && (
          <Badge variant="secondary" className="bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal">
            Edited by me
          </Badge>
        )}
        {invoice.status === "Approved" && (
          <Badge className="bg-teal text-white hover:bg-teal">Approved — awaiting ERP (not connected)</Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                <X aria-hidden="true" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save aria-hidden="true" /> Save
              </Button>
            </>
          ) : readOnly ? null : (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil aria-hidden="true" /> Edit
            </Button>
          )}
        </div>
      </div>

      <h2 className="mb-2 text-[28px] font-semibold leading-tight">
        {invoice.invoiceNumber} — {invoice.supplier}
      </h2>
      <p className="mb-4 max-w-[70ch] text-muted-foreground">
        Inspect the header, lines, and source PDF below. Use Edit to correct the extracted values, then
        Save — the change appears in My Actions. Header fields follow{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">invoice_header</code> in Tables.sql.
      </p>

      {readOnly && (
        <p className="mb-4 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          Live Oracle data: editing header fields is disabled in this step, but approving and
          rejecting write to Oracle (review action, Payables Manager notification
          {liveDecisions ? ", and ERP queue for approvals" : ""}). Switch the header toggle to Sample
          to work with the editable synthetic records.
        </p>
      )}

      {validation.level !== "ok" && (
        <div
          role="alert"
          className={
            validation.level === "invalid"
              ? "mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
              : "mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          }
        >
          <p className="font-semibold">
            {validation.level === "invalid"
              ? "Validation failed — this invoice should be rejected"
              : "Payables team review required before approving or rejecting"}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {validation.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          {validation.level === "invalid" && (
            <p className="mt-2">
              Remarks: “{INVALID_SUPPLIER_PROJECT_REMARKS}” — contact{" "}
              <a className="font-semibold underline" href={`mailto:${PAYABLES_CONTACT}`}>
                {PAYABLES_CONTACT}
              </a>
              . Use Reject below; approval is blocked. No email is sent automatically.
            </p>
          )}
          {validation.level === "review" && invoice.payablesReviewConfirmed && (
            <p className="mt-2 font-medium">Payables team review has been confirmed for this invoice.</p>
          )}
        </div>
      )}

      {!editing && approveReason && invoice.status !== "Approved" && (
        <p className="mb-4 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          Approval is unavailable: {approveReason}
        </p>
      )}
      {invoice.status === "Approved" && (
        <p className="mb-4 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          This invoice is approved and queued for ERP pickup. ERP integration is not connected, so
          nothing has been sent and no ERP invoice has been created.
        </p>
      )}
      {invoice.status === "Rejected" && (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          This invoice is rejected. Its rejection is recorded in My Actions.
        </p>
      )}
      {(!readOnly || liveDecisions) && !editing && invoice.status !== "Approved" && invoice.status !== "Rejected" && (
        <div className="mb-4 rounded-lg border bg-card p-4 text-card-foreground">
          {validation.level === "review" && !invoice.payablesReviewConfirmed && (
            <label className="mb-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={reviewConfirmed}
                onChange={(event) => setReviewConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 accent-teal"
              />
              <span>
                <strong>Payables team review confirmed.</strong> This invoice has an inactive
                supplier or project, so the payables team must review it before approving or
                rejecting. Tick this only after that review has happened.
              </span>
            </label>
          )}
          {validation.level === "review" && invoice.payablesReviewConfirmed && (
            <p className="mb-4 text-sm font-medium text-teal-dark dark:text-teal">
              Payables team review already confirmed for this invoice.
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">
              Remarks / comments (required to approve or reject)
            </span>
            <textarea
              value={approvalRemarks}
              onChange={(event) => setApprovalRemarks(event.target.value)}
              rows={3}
              placeholder={
                validation.level === "invalid"
                  ? INVALID_SUPPLIER_PROJECT_REMARKS
                  : "e.g. Verified against the PDF, PO, and delivery note."
              }
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </label>
          {validation.level === "invalid" && !approvalRemarks && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setApprovalRemarks(INVALID_SUPPLIER_PROJECT_REMARKS)}
            >
              Use rejection remarks: “{INVALID_SUPPLIER_PROJECT_REMARKS}”
            </Button>
          )}
          {approvalError && (
            <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
              {approvalError}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={!approvable} onClick={handleApprove}>
              <CheckCircle2 aria-hidden="true" /> Approve invoice
            </Button>
            <Button
              size="sm"
              disabled={!gate.canReject}
              onClick={handleReject}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              <X aria-hidden="true" /> Reject invoice
            </Button>
            <span className="text-sm text-muted-foreground">
              Approving sends an in-app notification, with these remarks, to Payables Manager.
              Rejecting records the remarks in My Actions. No email or ERP posting is sent.
            </span>
          </div>
          {!gate.canReject && gate.reasons.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">{gate.reasons.join(" ")}</p>
          )}
        </div>
      )}
      {savedChanges.length > 0 && (
        <div className="mb-4 rounded-md border border-teal/50 bg-teal-soft px-3 py-2 text-sm text-teal-dark dark:bg-teal/20 dark:text-teal">
          <p className="font-semibold">Saved. Recorded in My Actions:</p>
          <ul className="list-disc pl-5">
            {savedChanges.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      )}
      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <p className="font-semibold">Please fix before saving:</p>
          <ul className="list-disc pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {editing ? (
        <div className="mb-6 rounded-lg border bg-card p-5 text-card-foreground">
          <p className="mb-4 text-sm text-muted-foreground">
            Invoice number, supplier, project, and source channel are non-editable. All other header
            fields and the lines below can be corrected.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <EditField label="Invoice number (non-editable)">
              <Input value={draft.invoiceNumber} disabled readOnly aria-readonly="true" />
            </EditField>
            <EditField label="Supplier (non-editable)">
              <Input value={draft.supplier} disabled readOnly aria-readonly="true" />
            </EditField>
            <EditField label="Project (non-editable)">
              <Input value={draft.project} disabled readOnly aria-readonly="true" />
            </EditField>
            <EditField label="Project number">
              <Input value={draft.projectNumber} onChange={(e) => setDraft({ ...draft, projectNumber: e.target.value })} />
            </EditField>
            <EditField label="Job number">
              <Input value={draft.jobNumber} onChange={(e) => setDraft({ ...draft, jobNumber: e.target.value })} />
            </EditField>
            <EditField label="Source channel (non-editable)">
              <Input value={draft.source} disabled readOnly aria-readonly="true" />
            </EditField>
            <EditField label="Received date">
              <Input type="date" value={draft.receivedDate} onChange={(e) => setDraft({ ...draft, receivedDate: e.target.value })} />
            </EditField>
            <EditField label="Invoice date">
              <Input type="date" value={draft.invoiceDate} onChange={(e) => setDraft({ ...draft, invoiceDate: e.target.value })} />
            </EditField>
            <EditField label="Amount">
              <Input inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            </EditField>
            <EditField label="Currency">
              <Input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} />
            </EditField>
            <EditField label="Processing status">
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProcessingStatus })} className={selectClassName}>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </EditField>
            <EditField label="Exception count">
              <Input inputMode="numeric" value={draft.exceptionCount} onChange={(e) => setDraft({ ...draft, exceptionCount: e.target.value })} />
            </EditField>
            <EditField label="Remittance address">
              <Input value={draft.remittanceAddress} onChange={(e) => setDraft({ ...draft, remittanceAddress: e.target.value })} />
            </EditField>
            <EditField label="Bill To address">
              <Input value={draft.billToAddress} onChange={(e) => setDraft({ ...draft, billToAddress: e.target.value })} />
            </EditField>
            <EditField label="Source file (not editable)">
              <Input value={`${invoice.fileName} — ${invoice.filePath}`} disabled readOnly />
            </EditField>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Lines total below: {draft.currency} {draftTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDraft({ ...draft, amount: draftTotal.toFixed(2) })}
            >
              Set header amount to lines total
            </Button>
          </div>
          {((invoice.status !== "Approved" && draft.status === "Approved") ||
            (invoice.status !== "Rejected" && draft.status === "Rejected")) && (
            <div className="mt-4">
              {validation.level === "review" && !invoice.payablesReviewConfirmed && (
                <label className="mb-4 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewConfirmed}
                    onChange={(event) => setReviewConfirmed(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-teal"
                  />
                  <span>
                    <strong>Payables team review confirmed.</strong> Required before approving or
                    rejecting an invoice with an inactive supplier or project.
                  </span>
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">
                  Remarks / comments (required to {draft.status === "Approved" ? "approve" : "reject"})
                </span>
                <textarea
                  value={approvalRemarks}
                  onChange={(event) => setApprovalRemarks(event.target.value)}
                  rows={3}
                  placeholder={
                    draft.status === "Rejected" && validation.level === "invalid"
                      ? INVALID_SUPPLIER_PROJECT_REMARKS
                      : "e.g. Verified against the PDF, PO, and delivery note."
                  }
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                <span className="mt-1 block text-sm text-muted-foreground">
                  {draft.status === "Approved"
                    ? "Saving with status Approved sends an in-app notification, with these remarks, to Payables Manager."
                    : "Saving with status Rejected records these remarks in My Actions."}
                </span>
              </label>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-6 rounded-lg border bg-card p-5 text-card-foreground">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField label="Invoice number" value={invoice.invoiceNumber} />
            <DetailField label="Supplier" value={invoice.supplier} />
            <DetailField label="Project" value={`${invoice.project} (${invoice.projectNumber})`} />
            <DetailField label="Job / Project number" value={`${invoice.jobNumber} / ${invoice.projectNumber}`} />
            <DetailField label="Received date" value={formatDate(invoice.receivedDate)} />
            <DetailField label="Invoice date" value={formatDate(invoice.invoiceDate)} />
            <DetailField label="Amount with currency" value={`${formatAmount(invoice.amount, invoice.currency)} ${invoice.currency}`} />
            <DetailField label="Processing status" value={invoice.status} />
            <DetailField label="Exception count" value={String(invoice.exceptionCount)} />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source channel</dt>
              <dd className="mt-1">
                <SourceBadge source={invoice.source} live={liveDecisions} />
              </dd>
            </div>
            <DetailField label="Remittance address" value={invoice.remittanceAddress} />
            <DetailField label="Bill To address" value={invoice.billToAddress} />
            <DetailField label="Source file (file_details)" value={`${invoice.fileName} — ${invoice.filePath}`} />
          </dl>
        </div>
      )}

      <h3 className="mb-3 text-lg font-semibold">Invoice lines</h3>
      <div className="overflow-x-auto rounded-lg border bg-card text-card-foreground">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/60 text-[13px]">
              <th scope="col" className="px-3 py-2.5 font-semibold">Line</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Item Description</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Quantity</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Units</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Amount</th>
              {editing && (
                <th scope="col" className="px-3 py-2.5">
                  <span className="sr-only">Remove line</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {editing
              ? draft.lines.map((line, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-3 py-2">{index + 1}</td>
                    <td className="min-w-[220px] px-3 py-2">
                      <Input value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} aria-label={`Line ${index + 1} description`} />
                    </td>
                    <td className="px-3 py-2">
                      <Input inputMode="decimal" className="text-right" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} aria-label={`Line ${index + 1} quantity`} />
                    </td>
                    <td className="px-3 py-2">
                      <Input value={line.units} onChange={(e) => updateLine(index, { units: e.target.value })} aria-label={`Line ${index + 1} units`} />
                    </td>
                    <td className="px-3 py-2">
                      <Input inputMode="decimal" className="text-right" value={line.amount} onChange={(e) => updateLine(index, { amount: e.target.value })} aria-label={`Line ${index + 1} amount`} />
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={draft.lines.length <= 1}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            lines: current.lines.filter((_, i) => i !== index),
                          }))
                        }
                        aria-label={`Remove line ${index + 1}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))
              : invoice.lines.map((line) => (
                  <tr key={line.lineNum} className="border-b last:border-0">
                    <td className="px-3 py-2.5">{line.lineNum}</td>
                    <td className="px-3 py-2.5">{line.description}</td>
                    <td className="px-3 py-2.5 text-right">{line.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2.5">{line.units}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{formatAmount(line.amount, invoice.currency)}</td>
                  </tr>
                ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/60 font-semibold">
              <td colSpan={4} className="px-3 py-2.5 text-right">
                Lines total ({invoice.currency})
              </td>
              <td className="px-3 py-2.5 text-right">
                {formatAmount(editing ? draftTotal : total, invoice.currency)}
              </td>
              {editing && <td />}
            </tr>
            {!editing && (
              <tr className="font-semibold">
                <td colSpan={4} className="px-3 py-2.5 text-right">
                  Header amount due ({invoice.currency})
                </td>
                <td className="px-3 py-2.5 text-right">{formatAmount(invoice.amount, invoice.currency)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {editing && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              lines: [
                ...current.lines,
                {
                  lineNum: String(current.lines.length + 1),
                  description: "",
                  quantity: "1",
                  units: "ea",
                  unitPrice: 0,
                  amount: "0",
                },
              ],
            }))
          }
        >
          <Plus aria-hidden="true" /> Add line
        </Button>
      )}

      {!editing && Math.abs(total - invoice.amount) >= 0.005 && (
        <p className="mt-3">
          <Badge className="bg-red-600 text-white hover:bg-red-600">Lines total differs from header amount</Badge>
        </p>
      )}

      <div className="mt-8">
        <PdfViewer invoice={invoice} live={readOnly} />
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Synthetic record only. Edits are stored in this browser and recorded in My Actions. No ERP
        posting runs on this screen, and ERP integration is not connected.
      </p>
    </section>
  );
}
