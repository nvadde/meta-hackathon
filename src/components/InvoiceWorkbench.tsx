import { InvoiceTable } from "@/components/InvoiceTable";
import { ManualUpload } from "@/components/ManualUpload";
import { SourceConnections } from "@/components/SourceConnections";
import type { Invoice } from "@/data/invoices";
import type { ProjectFeedRecord } from "@/data/projects";
import type { SupplierFeedRecord } from "@/data/suppliers";
import type { DataMode } from "@/components/TopBar";

export function InvoiceWorkbench({
  invoices,
  dataMode,
  supplierFeed,
  projectFeed,
  onSelectInvoice,
  onAddInvoice,
}: {
  invoices: Invoice[];
  dataMode: DataMode;
  supplierFeed: SupplierFeedRecord[];
  projectFeed: ProjectFeedRecord[];
  onSelectInvoice: (invoice: Invoice) => void;
  onAddInvoice: (invoice: Invoice) => void;
}) {
  const live = dataMode === "live";
  return (
    <section aria-label="Invoice Workbench" className="mx-auto w-full max-w-[1400px]">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
        Invoice Workbench {live ? "· Live (Oracle)" : "· Sample data"}
      </p>
      <h2 className="mb-2 text-[28px] font-semibold leading-tight">Invoice Workbench</h2>
      <p className="mb-6 max-w-[70ch] text-muted-foreground">
        {live ? (
          <>
            Live invoice records read from Oracle (<code className="rounded bg-muted px-1 py-0.5 text-xs">INVOICE_HEADER</code>{" "}
            / <code className="rounded bg-muted px-1 py-0.5 text-xs">INVOICE_LINES</code>). Live data is
            read-only in this step. Amounts are never combined across currencies.
          </>
        ) : (
          <>
            Clearly labeled synthetic invoice records, mapped to the fields in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Tables.sql</code>. Source badges on these
            records are sample labels, not live connections. Amounts are never combined across currencies.
            Edits you save on a detail screen appear here and in My Actions.
          </>
        )}
      </p>

      {!live && <SourceConnections />}
      {!live && <ManualUpload onAddInvoice={onAddInvoice} onOpenInvoice={onSelectInvoice} />}
      <InvoiceTable
        invoices={invoices}
        onSelectInvoice={onSelectInvoice}
        showUsdColumn
        supplierFeed={supplierFeed}
        projectFeed={projectFeed}
        emptyTitle={live ? "No live invoices in Oracle" : "No invoices match"}
        emptyText={
          live
            ? "INVOICE_HEADER in Oracle has no rows yet, so there is nothing live to show. Switch the header toggle to Sample to see the synthetic records, or load data into Oracle."
            : "No invoices match the current search and filters. Clear them to see all records."
        }
      />
    </section>
  );
}
