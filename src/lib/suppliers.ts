import type { Invoice } from "../data/invoices.ts";
import type { SupplierFeedRecord } from "../data/suppliers.ts";

export interface SupplierRow extends SupplierFeedRecord {
  invoiceCount: number;
  /** False when the supplier appears on invoices but not in the ERP feed sample. */
  inFeed: boolean;
}

export function buildSupplierRows(
  allInvoices: Invoice[],
  feed: SupplierFeedRecord[],
): SupplierRow[] {
  const counts = new Map<string, number>();
  for (const invoice of allInvoices) {
    counts.set(invoice.supplier, (counts.get(invoice.supplier) ?? 0) + 1);
  }

  const rows: SupplierRow[] = feed.map((record) => ({
    ...record,
    invoiceCount: counts.get(record.supplier) ?? 0,
    inFeed: true,
  }));

  const feedNames = new Set(feed.map((record) => record.supplier));
  for (const invoice of allInvoices) {
    if (feedNames.has(invoice.supplier)) continue;
    feedNames.add(invoice.supplier);
    rows.push({
      supplier: invoice.supplier,
      status: "Active",
      startDate: invoice.receivedDate,
      endDate: null,
      site: "Not in ERP feed",
      address: invoice.remittanceAddress || "—",
      invoiceCount: counts.get(invoice.supplier) ?? 0,
      inFeed: false,
    });
  }
  return rows;
}
