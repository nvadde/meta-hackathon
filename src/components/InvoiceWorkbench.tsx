import { useState } from "react";

import { InvoiceTable } from "@/components/InvoiceTable";
import { ManualUpload } from "@/components/ManualUpload";
import { SourceConnections } from "@/components/SourceConnections";
import type { Invoice } from "@/data/invoices";
import type { ProjectFeedRecord } from "@/data/projects";
import type { SupplierFeedRecord } from "@/data/suppliers";
import type { ConversionEngine, DataMode } from "@/components/TopBar";

export function InvoiceWorkbench({
  invoices,
  dataMode,
  engine,
  supplierFeed,
  projectFeed,
  onSelectInvoice,
  onAddInvoice,
  onRefresh,
  onSynced,
}: {
  invoices: Invoice[];
  dataMode: DataMode;
  engine: ConversionEngine;
  supplierFeed: SupplierFeedRecord[];
  projectFeed: ProjectFeedRecord[];
  onSelectInvoice: (invoice: Invoice) => void;
  onAddInvoice: (invoice: Invoice) => void;
  onRefresh?: () => Promise<unknown> | unknown;
  onSynced?: () => Promise<unknown> | unknown;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  }
  const live = dataMode === "live";
  const [uploadOpen, setUploadOpen] = useState(false);
  const openUploadPanel = () => {
    setUploadOpen(true);
    document.getElementById("manual-upload-panel")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <section aria-label="Invoice Workbench" className="mx-auto w-full max-w-[1400px]">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
        Invoice Workbench {live ? "· Live (Oracle)" : "· Sample data"}
      </p>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[28px] font-semibold leading-tight">Invoice Workbench</h2>
        {live && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh from Oracle"}
          </button>
        )}
      </div>

      <SourceConnections engine={engine} onUpload={openUploadPanel} onSynced={onSynced} />
      <ManualUpload
        onAddInvoice={onAddInvoice}
        onOpenInvoice={onSelectInvoice}
        supplierFeed={supplierFeed}
        projectFeed={projectFeed}
        mode={engine}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
      <InvoiceTable
        invoices={invoices}
        onSelectInvoice={onSelectInvoice}
        showUsdColumn
        supplierFeed={supplierFeed}
        projectFeed={projectFeed}
        liveSources={live}
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
