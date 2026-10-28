import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, History, PencilLine, PlugZap, RotateCcw } from "lucide-react";

import { InvoiceTable } from "@/components/InvoiceTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Invoice } from "@/data/invoices";
import type { ProjectFeedRecord } from "@/data/projects";
import type { SupplierFeedRecord } from "@/data/suppliers";
import { deriveMyActions, type ChangeEntry } from "@/lib/review";

function SummaryCard({
  icon: Icon,
  label,
  count,
  text,
}: {
  icon: typeof AlertTriangle;
  label: string;
  count: number;
  text: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="mb-1 flex items-center gap-2">
        <Icon aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
        <h3 className="font-semibold">{label}</h3>
        <Badge variant="secondary" className="ml-auto bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal">
          {count}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export function MyActions({
  invoices,
  dataMode,
  supplierFeed,
  projectFeed,
  editedIds,
  changeLog,
  onSelectInvoice,
  onResetData,
}: {
  invoices: Invoice[];
  dataMode?: "sample" | "live";
  supplierFeed: SupplierFeedRecord[];
  projectFeed: ProjectFeedRecord[];
  editedIds: ReadonlySet<string>;
  changeLog: ChangeEntry[];
  onSelectInvoice: (invoice: Invoice) => void;
  onResetData: () => void;
}) {
  const items = useMemo(() => deriveMyActions(invoices, editedIds, supplierFeed, projectFeed), [invoices, editedIds, supplierFeed, projectFeed]);
  const actionInvoices = useMemo(() => items.map((item) => item.invoice), [items]);
  const actionKinds = useMemo(
    () => new Map(items.map((item) => [item.invoice.id, item.kinds])),
    [items],
  );
  const needsReview = items.filter((item) => item.kinds.includes("needs-review")).length;
  const edited = items.filter((item) => item.kinds.includes("edited")).length;
  const approved = items.filter((item) => item.kinds.includes("approved")).length;

  return (
    <section aria-label="My Actions" className="mx-auto w-full max-w-[1400px]">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <p className="text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
          My Actions
        </p>
        {dataMode !== "live" && (
          <Button variant="outline" size="sm" onClick={onResetData} className="ml-auto">
            <RotateCcw aria-hidden="true" /> Reset sample data
          </Button>
        )}
      </div>
      <h2 className="mb-2 text-[28px] font-semibold leading-tight">Invoice review workbench</h2>
      <p className="mb-4 max-w-[75ch] text-muted-foreground">
        Exception invoices to inspect and correct, invoices you have edited, and invoices you have
        approved. Open any row to check its header, lines, and source PDF, then use Edit and Save to
        correct it. Every saved change is listed under My changes below.
      </p>

      <div className="mb-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <PlugZap aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-sm">
          <strong>ERP integration is not connected.</strong> Approved invoices are marked “Approved —
          awaiting ERP” and would be picked up for ERP invoice creation once that integration exists.
          Nothing is sent to an ERP from this screen, and edits are stored only in this browser.
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={AlertTriangle}
          label="Needs review"
          count={needsReview}
          text="Invoices with exceptions, an invalid supplier/project (reject them), or an inactive supplier/project needing payables team review before any decision."
        />
        <SummaryCard
          icon={PencilLine}
          label="Edited by me"
          count={edited}
          text="Invoices with saved corrections in this browser. Each save is recorded under My changes."
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Approved — awaiting ERP"
          count={approved}
          text="Approved invoices ready for ERP pickup. ERP is not connected, so they stay queued here."
        />
      </div>

      <InvoiceTable
        invoices={actionInvoices}
        onSelectInvoice={onSelectInvoice}
        actionKinds={actionKinds}
        supplierFeed={supplierFeed}
        projectFeed={projectFeed}
        emptyTitle="No actions outstanding"
        emptyText="No invoices need review, none have been edited, and none are approved yet. Exception invoices will appear here automatically."
      />

      <h3 className="mb-3 mt-8 flex items-center gap-2 text-lg font-semibold">
        <History aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
        My changes
      </h3>
      {changeLog.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-8 text-center text-card-foreground">
          <h4 className="mb-1 font-semibold">No changes yet</h4>
          <p className="mx-auto max-w-[56ch] text-sm text-muted-foreground">
            When you edit and save an invoice, or approve one, the change will be recorded here with the
            old and new values.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {changeLog.map((entry) => (
            <li key={entry.id} className="rounded-lg border bg-card p-4 text-card-foreground">
              <p className="text-sm">
                <strong>
                  {entry.invoiceNumber} — {entry.supplier}
                </strong>{" "}
                <span className="text-muted-foreground">
                  · {new Date(entry.at).toLocaleString()}
                </span>
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {entry.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
