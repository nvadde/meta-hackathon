import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Search,
} from "lucide-react";

import { SourceBadge } from "@/components/SourceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  invoiceSources,
  processingStatuses,
  type Invoice,
  type InvoiceSource,
  type ProcessingStatus,
} from "@/data/invoices";
import { projectFeed as sampleProjectFeed, type ProjectFeedRecord } from "@/data/projects";
import { supplierFeed as sampleSupplierFeed, type SupplierFeedRecord } from "@/data/suppliers";
import { convertToUsd, SAMPLE_RATES_LABEL } from "@/lib/currency";
import { formatAmount, formatDate } from "@/lib/format";
import { validateInvoice } from "@/lib/validation";
import type { ActionKind } from "@/lib/review";
import { cn } from "@/lib/utils";

export const actionKindLabels: Record<ActionKind, string> = {
  "needs-review": "Needs review",
  edited: "Edited by me",
  approved: "Approved — awaiting ERP",
};

const PAGE_SIZE = 8;

type SortKey = "invoiceNumber" | "supplier" | "receivedDate" | "amount" | "amountUsd" | "exceptionCount";
type SortDirection = "asc" | "desc";

const statusStyles: Record<ProcessingStatus, string> = {
  Received: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  Processing:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  Matched: "border-teal/40 bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal",
  Exception: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  Ready: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  Approved: "border-teal bg-teal text-white dark:border-teal dark:bg-teal dark:text-white",
  Rejected: "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900 dark:text-red-100",
};

const selectClassName =
  "h-10 rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" className={cn("px-3 py-2.5", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
        className={cn(
          "inline-flex items-center gap-1 font-semibold hover:text-teal-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-teal",
          active && "text-teal-dark dark:text-teal",
        )}
      >
        {label}
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

export interface InvoiceTableProps {
  invoices: Invoice[];
  onSelectInvoice: (invoice: Invoice) => void;
  actionKinds?: ReadonlyMap<string, ActionKind[]>;
  showUsdColumn?: boolean;
  supplierFeed?: SupplierFeedRecord[];
  projectFeed?: ProjectFeedRecord[];
  emptyTitle?: string;
  emptyText?: string;
  liveSources?: boolean;
}

export function InvoiceTable({
  invoices,
  onSelectInvoice,
  actionKinds,
  showUsdColumn = false,
  supplierFeed = sampleSupplierFeed,
  projectFeed = sampleProjectFeed,
  emptyTitle = "No invoices match",
  emptyText = "No invoices match the current search and filters. Clear them to see all records.",
  liveSources = false,
}: InvoiceTableProps) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"All" | InvoiceSource>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | ProcessingStatus>("All");
  const [currencyFilter, setCurrencyFilter] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("receivedDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const projects = useMemo(() => [...new Set(invoices.map((i) => i.project))].sort(), []);
  const currencies = useMemo(() => [...new Set(invoices.map((i) => i.currency))].sort(), []);
  const statuses = processingStatuses;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = invoices.filter((invoice) => {
      if (sourceFilter !== "All" && invoice.source !== sourceFilter) return false;
      if (statusFilter !== "All" && invoice.status !== statusFilter) return false;
      if (currencyFilter !== "All" && invoice.currency !== currencyFilter) return false;
      if (projectFilter !== "All" && invoice.project !== projectFilter) return false;
      if (!term) return true;
      return [invoice.invoiceNumber, invoice.supplier, invoice.project, invoice.projectNumber, invoice.jobNumber]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });

    const sorted = [...rows].sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "amount":
          result = a.amount - b.amount;
          break;
        case "amountUsd": {
          const aUsd = convertToUsd(a.amount, a.currency);
          const bUsd = convertToUsd(b.amount, b.currency);
          result = (aUsd ?? Number.NEGATIVE_INFINITY) - (bUsd ?? Number.NEGATIVE_INFINITY);
          break;
        }
        case "exceptionCount":
          result = a.exceptionCount - b.exceptionCount;
          break;
        case "receivedDate":
          result = a.receivedDate.localeCompare(b.receivedDate);
          break;
        case "supplier":
          result = a.supplier.localeCompare(b.supplier);
          break;
        default:
          result = a.invoiceNumber.localeCompare(b.invoiceNumber);
      }
      return sortDirection === "asc" ? result : -result;
    });
    return sorted;
  }, [invoices, search, sourceFilter, statusFilter, currencyFilter, projectFilter, sortKey, sortDirection]);

  const currencyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const invoice of filtered) {
      totals.set(invoice.currency, (totals.get(invoice.currency) ?? 0) + invoice.amount);
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "receivedDate" ? "desc" : "asc");
    }
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setSourceFilter("All");
    setStatusFilter("All");
    setCurrencyFilter("All");
    setProjectFilter("All");
    setPage(1);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium">
          {filtered.length} of {invoices.length} invoices
        </span>
        {currencyTotals.map(([currency, total]) => (
          <Badge key={currency} variant="secondary" className="bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal">
            {currency}: {formatAmount(total, currency)}
          </Badge>
        ))}
        <span className="text-xs text-muted-foreground">Totals are kept separate per currency.</span>
        {showUsdColumn && (
          <span className="text-xs text-muted-foreground">
            Amount in USD uses {SAMPLE_RATES_LABEL.toLowerCase()}; original currency amounts stay the
            records of truth.
          </span>
        )}
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 text-card-foreground">
        <label className="relative block">
          <span className="sr-only">Search invoices</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search invoice number, supplier, project, job number…"
            className="pl-9"
          />
        </label>
        <div className="grid grid-cols-4 gap-2">
          <label className="block">
            <span className="sr-only">Filter by source</span>
            <select
              value={sourceFilter}
              onChange={(event) => {
                setSourceFilter(event.target.value as "All" | InvoiceSource);
                setPage(1);
              }}
              className={cn(selectClassName, "w-full")}
            >
              <option value="All">Source: All</option>
            {invoiceSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as "All" | ProcessingStatus);
              setPage(1);
            }}
            className={cn(selectClassName, "w-full")}
          >
            <option value="All">Status: All</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Filter by project</span>
          <select
            value={projectFilter}
            onChange={(event) => {
              setProjectFilter(event.target.value);
              setPage(1);
            }}
            className={cn(selectClassName, "w-full")}
          >
            <option value="All">Project: All</option>
            {projects.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Filter by currency</span>
          <select
            value={currencyFilter}
            onChange={(event) => {
              setCurrencyFilter(event.target.value);
              setPage(1);
            }}
            className={cn(selectClassName, "w-full")}
          >
            <option value="All">Currency: All</option>
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        </div>
      </div>

      {pageRows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center text-card-foreground">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-[10px] bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal"
          >
            <Inbox className="h-[26px] w-[26px]" strokeWidth={1.8} />
          </div>
          <h3 className="mb-2 text-lg font-semibold">{emptyTitle}</h3>
          <p className="mx-auto mb-4 max-w-[52ch] text-muted-foreground">{emptyText}</p>
          <Button onClick={clearFilters}>Clear search and filters</Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card text-card-foreground">
            <table className="w-full min-w-[1240px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/60 text-[13px]">
                  <SortHeader label="Invoice number" sortKey="invoiceNumber" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Supplier" sortKey="supplier" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <th scope="col" className="px-3 py-2.5 font-semibold">Project</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Source channel</th>
                  <SortHeader label="Received date" sortKey="receivedDate" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Amount" sortKey="amount" activeKey={sortKey} direction={sortDirection} onSort={handleSort} className="text-right" />
                  {showUsdColumn && (
                    <SortHeader label="Amount in USD" sortKey="amountUsd" activeKey={sortKey} direction={sortDirection} onSort={handleSort} className="text-right" />
                  )}
                  <th scope="col" className="px-3 py-2.5 font-semibold">Processing status</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Remittance address</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Bill To address</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Job / Project number</th>
                  <SortHeader label="Exceptions" sortKey="exceptionCount" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    <span className="sr-only">Open invoice</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((invoice) => (
                  <tr key={invoice.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                      <button
                        type="button"
                        onClick={() => onSelectInvoice(invoice)}
                        aria-label={`Open invoice ${invoice.invoiceNumber} details`}
                        className="font-medium text-teal-dark underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-teal"
                      >
                        {invoice.invoiceNumber}
                      </button>
                      {actionKinds?.get(invoice.id)?.map((kind) => (
                        <Badge
                          key={kind}
                          variant="secondary"
                          className="ml-2 bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal"
                        >
                          {actionKindLabels[kind]}
                        </Badge>
                      ))}
                      {(() => {
                        const validation = validateInvoice(invoice, supplierFeed, projectFeed);
                        if (validation.level === "invalid") {
                          return (
                            <Badge className="ml-2 bg-red-600 text-white hover:bg-red-600">
                              Invalid supplier/project — reject
                            </Badge>
                          );
                        }
                        if (validation.level === "review" && !invoice.payablesReviewConfirmed) {
                          return (
                            <Badge
                              variant="outline"
                              className="ml-2 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                            >
                              Payables review required
                            </Badge>
                          );
                        }
                        return null;
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{invoice.supplier}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {invoice.project}
                      <span className="block text-xs text-muted-foreground">{invoice.projectNumber}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <SourceBadge source={invoice.source} live={liveSources} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{formatDate(invoice.receivedDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                      {formatAmount(invoice.amount, invoice.currency)}
                      <span className="block text-xs font-normal text-muted-foreground">{invoice.currency}</span>
                    </td>
                    {showUsdColumn && (
                      <td
                        className="whitespace-nowrap px-3 py-2.5 text-right font-medium"
                        title={
                          invoice.currency === "USD"
                            ? "Original currency is USD"
                            : `${SAMPLE_RATES_LABEL}. Rate: 1 ${invoice.currency} = ${convertToUsd(1, invoice.currency)?.toFixed(2)} USD`
                        }
                      >
                        {(() => {
                          const usd = convertToUsd(invoice.amount, invoice.currency);
                          return usd === null ? "—" : formatAmount(usd, "USD");
                        })()}
                        <span className="block text-xs font-normal text-muted-foreground">USD</span>
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Badge variant="outline" className={statusStyles[invoice.status]}>
                        {invoice.status}
                      </Badge>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5" title={invoice.remittanceAddress}>
                      {invoice.remittanceAddress}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5" title={invoice.billToAddress}>
                      {invoice.billToAddress}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {invoice.jobNumber}
                      <span className="block text-xs text-muted-foreground">{invoice.projectNumber}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {invoice.exceptionCount > 0 ? (
                        <Badge className="bg-red-600 text-white hover:bg-red-600">{invoice.exceptionCount}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Button size="sm" variant="outline" onClick={() => onSelectInvoice(invoice)}>
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Page {safePage} of {pageCount} · {filtered.length} invoices
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft aria-hidden="true" /> Previous
              </Button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                <Button
                  key={pageNumber}
                  size="sm"
                  variant={pageNumber === safePage ? "default" : "outline"}
                  aria-current={pageNumber === safePage ? "page" : undefined}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={safePage >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                Next <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
