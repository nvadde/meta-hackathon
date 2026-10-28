import type { Invoice } from "../data/invoices.ts";
import type { ProjectFeedRecord } from "../data/projects.ts";

export interface ProjectRow extends ProjectFeedRecord {
  invoiceCount: number;
  /** False when the project appears on invoices but not in the ERP feed sample. */
  inFeed: boolean;
}

export function buildProjectRows(
  allInvoices: Invoice[],
  feed: ProjectFeedRecord[],
): ProjectRow[] {
  const counts = new Map<string, number>();
  for (const invoice of allInvoices) {
    if (!invoice.project) continue;
    counts.set(invoice.project, (counts.get(invoice.project) ?? 0) + 1);
  }

  const rows: ProjectRow[] = feed.map((record) => ({
    ...record,
    invoiceCount: counts.get(record.project) ?? 0,
    inFeed: true,
  }));

  const feedNames = new Set(feed.map((record) => record.project));
  for (const invoice of allInvoices) {
    if (!invoice.project || feedNames.has(invoice.project)) continue;
    feedNames.add(invoice.project);
    rows.push({
      project: invoice.project,
      projectNumber: invoice.projectNumber || "—",
      status: "Active",
      startDate: invoice.receivedDate,
      endDate: null,
      address: invoice.billToAddress || "Not in ERP feed",
      invoiceCount: counts.get(invoice.project) ?? 0,
      inFeed: false,
    });
  }
  return rows;
}
