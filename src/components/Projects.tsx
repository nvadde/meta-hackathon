import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Search,
} from "lucide-react";

import { InvoiceTable } from "@/components/InvoiceTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Invoice } from "@/data/invoices";
import type { ProjectFeedRecord, ProjectStatus } from "@/data/projects";
import type { SupplierFeedRecord } from "@/data/suppliers";
import { formatDate } from "@/lib/format";
import { buildProjectRows, type ProjectRow } from "@/lib/projects";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

type SortKey = "project" | "startDate" | "invoiceCount";
type SortDirection = "asc" | "desc";

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

export function Projects({
  invoices,
  supplierFeed,
  projectFeed,
  selectedProject,
  onSelectProject,
  onSelectInvoice,
}: {
  invoices: Invoice[];
  supplierFeed: SupplierFeedRecord[];
  projectFeed: ProjectFeedRecord[];
  selectedProject: string | null;
  onSelectProject: (project: string | null) => void;
  onSelectInvoice: (invoice: Invoice) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ProjectStatus>("All");
  const [sortKey, setSortKey] = useState<SortKey>("project");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => buildProjectRows(invoices, projectFeed), [invoices, projectFeed]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = rows.filter((row) => {
      if (statusFilter !== "All" && row.status !== statusFilter) return false;
      if (!term) return true;
      return [row.project, row.projectNumber, row.address].join(" ").toLowerCase().includes(term);
    });
    return [...matched].sort((a, b) => {
      let result = 0;
      if (sortKey === "invoiceCount") result = a.invoiceCount - b.invoiceCount;
      else if (sortKey === "startDate") result = a.startDate.localeCompare(b.startDate);
      else result = a.project.localeCompare(b.project);
      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, search, statusFilter, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectedRow: ProjectRow | null =
    rows.find((row) => row.project === selectedProject) ?? null;
  const selectedInvoices = useMemo(
    () => (selectedProject ? invoices.filter((invoice) => invoice.project === selectedProject) : []),
    [invoices, selectedProject],
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("All");
    setPage(1);
  }

  if (selectedProject && selectedRow) {
    return (
      <section aria-label={`${selectedProject} invoices`} className="mx-auto w-full max-w-[1400px]">
        <Button variant="ghost" size="sm" onClick={() => onSelectProject(null)} className="mb-4 -ml-2">
          <ArrowLeft aria-hidden="true" /> Back to Projects
        </Button>
        <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
          Project invoices
        </p>
        <h2 className="mb-2 text-[28px] font-semibold leading-tight">
          {selectedRow.project} ({selectedRow.projectNumber})
        </h2>
        <p className="mb-6 max-w-[75ch] text-muted-foreground">
          {selectedRow.address} · Status {selectedRow.status} · Since {formatDate(selectedRow.startDate)}
          {selectedRow.endDate ? ` · Ended ${formatDate(selectedRow.endDate)}` : ""}. Click an invoice
          number or View Details to open the invoice, its lines, and its PDF.
        </p>
        <InvoiceTable
          invoices={selectedInvoices}
          onSelectInvoice={onSelectInvoice}
          supplierFeed={supplierFeed}
          projectFeed={projectFeed}
          emptyTitle="No invoices for this project"
          emptyText="This project has no invoices in the current workbench records."
        />
      </section>
    );
  }

  return (
    <section aria-label="Projects" className="mx-auto w-full max-w-[1400px]">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
        Projects
      </p>
      <h2 className="mb-2 text-[28px] font-semibold leading-tight">Projects</h2>
      <p className="mb-6 max-w-[75ch] text-muted-foreground">
        Project Details feed received from ERP — shown here as a clearly labeled synthetic sample
        feed, because ERP is not connected. The “No. of invoices” counts the current workbench records
        for each project, including Manual Uploads. Choose a project to see its invoices, then open an
        invoice to reach its detail screen.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium">
          {filtered.length} of {rows.length} projects
        </span>
        <Badge variant="secondary" className="bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal">
          {rows.filter((row) => row.status === "Active").length} Active
        </Badge>
        <Badge variant="secondary">
          {rows.filter((row) => row.status === "Inactive").length} Inactive
        </Badge>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 text-card-foreground md:grid-cols-2">
        <label className="relative block">
          <span className="sr-only">Search projects</span>
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
            placeholder="Search project, project number, address…"
            className="pl-9"
          />
        </label>
        <label className="block">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as "All" | ProjectStatus);
              setPage(1);
            }}
            className={cn(selectClassName, "w-full")}
          >
            <option value="All">Status: All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>
      </div>

      {pageRows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center text-card-foreground">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-[10px] bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal"
          >
            <FolderKanban className="h-[26px] w-[26px]" strokeWidth={1.8} />
          </div>
          <h3 className="mb-2 text-lg font-semibold">No projects match</h3>
          <p className="mx-auto mb-4 max-w-[52ch] text-muted-foreground">
            No projects in the sample ERP feed match the current search and filters.
          </p>
          <Button onClick={clearFilters}>Clear search and filters</Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card text-card-foreground">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/60 text-[13px]">
                  <SortHeader label="Project" sortKey="project" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                  <SortHeader label="Start date" sortKey="startDate" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <th scope="col" className="px-3 py-2.5 font-semibold">End date</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Project address</th>
                  <SortHeader label="No. of invoices" sortKey="invoiceCount" activeKey={sortKey} direction={sortDirection} onSort={handleSort} className="text-right" />
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    <span className="sr-only">View project invoices</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.project} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                      <button
                        type="button"
                        onClick={() => onSelectProject(row.project)}
                        aria-label={`View invoices for ${row.project}`}
                        className="font-medium text-teal-dark underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-teal"
                      >
                        {row.project}
                      </button>
                      <span className="block text-xs font-normal text-muted-foreground">{row.projectNumber}</span>
                      {!row.inFeed && (
                        <Badge variant="secondary" className="mt-1">
                          Not in ERP feed
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={
                          row.status === "Active"
                            ? "border-teal/40 bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal"
                            : "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900 dark:text-red-100"
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{formatDate(row.startDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {row.endDate ? formatDate(row.endDate) : "—"}
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-2.5" title={row.address}>
                      {row.address}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{row.invoiceCount}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Button size="sm" variant="outline" onClick={() => onSelectProject(row.project)}>
                        View invoices
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Page {safePage} of {pageCount} · {filtered.length} projects
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
    </section>
  );
}
