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
}: {
  invoices: Invoice[];
  dataMode: DataMode;
  engine: ConversionEngine;
  supplierFeed: SupplierFeedRecord[];
  projectFeed: ProjectFeedRecord[];
  onSelectInvoice: (invoice: Invoice) => void;
  onAddInvoice: (invoice: Invoice) => void;
}) {
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
      <h2 className="mb-2 text-[28px] font-semibold leading-tight">Invoice Workbench</h2>

      <SourceConnections engine={engine} onUpload={openUploadPanel} />
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
