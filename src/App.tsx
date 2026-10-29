import { useCallback, useEffect, useMemo, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { EmptyState } from "@/components/EmptyState";
import { InvoiceDetail } from "@/components/InvoiceDetail";
import { InvoiceWorkbench } from "@/components/InvoiceWorkbench";
import { MyActions } from "@/components/MyActions";
import { Connections } from "@/components/Connections";
import { Notifications } from "@/components/Notifications";
import { Projects } from "@/components/Projects";
import { Suppliers } from "@/components/Suppliers";
import { TopBar, type ConversionEngine, type DataMode } from "@/components/TopBar";
import { invoices as sampleInvoices, sanitizeStoredInvoices, type Invoice } from "@/data/invoices";
import { sections } from "@/data/sections";
import { useTheme } from "@/hooks/useTheme";
import { projectFeed as sampleProjectFeed, type ProjectFeedRecord } from "@/data/projects";
import { supplierFeed as sampleSupplierFeed, type SupplierFeedRecord } from "@/data/suppliers";
import {
  createApprovalNotification,
  createDecisionNotification,
  describeInvoiceChanges,
  isApprovalTransition,
  type ApprovalNotification,
  type ChangeEntry,
} from "@/lib/review";
import { INVALID_SUPPLIER_PROJECT_REMARKS, validateInvoice } from "@/lib/validation";

const INVOICES_KEY = "sire-invoices-v1";
const EDITED_KEY = "sire-edited-ids-v1";
const LOG_KEY = "sire-change-log-v1";
const NOTIFICATIONS_KEY = "sire-notifications-v1";
const DATA_MODE_KEY = "sire-data-mode";

interface LiveData {
  suppliers: SupplierFeedRecord[];
  projects: ProjectFeedRecord[];
  invoices: Invoice[];
}

type LiveState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: LiveData }
  | { kind: "error"; message: string };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable; state still works for this session.
  }
}

type DetailOrigin = "workbench" | "actions" | "suppliers" | "projects";

/** Records saved by earlier versions used the source name "Upload". */
function migrateInvoices(records: Invoice[]): Invoice[] {
  return records.map((record) =>
    (record.source as string) === "Upload"
      ? { ...record, source: "Manual Upload" }
      : record,
  );
}

export default function App() {
  const [activeId, setActiveId] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [invoiceRecords, setInvoiceRecords] = useState<Invoice[]>(() =>
    sanitizeStoredInvoices(
      migrateInvoices(load<Invoice[]>(INVOICES_KEY, sampleInvoices)),
      sampleInvoices,
    ),
  );
  const [editedIds, setEditedIds] = useState<ReadonlySet<string>>(
    () => new Set(load<string[]>(EDITED_KEY, [])),
  );
  const [changeLog, setChangeLog] = useState<ChangeEntry[]>(() => load<ChangeEntry[]>(LOG_KEY, []));
  const [notifications, setNotifications] = useState<ApprovalNotification[]>(() =>
    load<ApprovalNotification[]>(NOTIFICATIONS_KEY, []),
  );
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>("workbench");
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [engine, setEngine] = useState<ConversionEngine>("llama");
  const [dataMode, setDataMode] = useState<DataMode>(() =>
    load<string>(DATA_MODE_KEY, "sample") === "live" ? "live" : "sample",
  );
  const [liveState, setLiveState] = useState<LiveState>({ kind: "idle" });
  const { theme, toggleTheme } = useTheme();

  const isLive = dataMode === "live";
  const liveData: LiveData =
    liveState.kind === "ready"
      ? liveState.data
      : { suppliers: [], projects: [], invoices: [] };
  const activeInvoices = isLive ? liveData.invoices : invoiceRecords;
  const activeSupplierFeed = isLive ? liveData.suppliers : sampleSupplierFeed;
  const activeProjectFeed = isLive ? liveData.projects : sampleProjectFeed;

  useEffect(() => {
    store(DATA_MODE_KEY, dataMode);
  }, [dataMode]);

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    setLiveState({ kind: "loading" });
    fetch("/api/live/data")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Live data request failed (${response.status})`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.connected) {
          setLiveState({
            kind: "error",
            message:
              data.error ||
              "Oracle did not connect. Check Connections and that npm run server is running.",
          });
          return;
        }
        setLiveState({
          kind: "ready",
          data: {
            suppliers: data.suppliers || [],
            projects: data.projects || [],
            invoices: data.invoices || [],
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLiveState({
            kind: "error",
            message:
              "The backend is not reachable, so live Oracle data cannot be loaded. Start it with npm run server.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isLive]);

  const changeDataMode = useCallback((mode: DataMode) => {
    setDataMode(mode);
    setSelectedInvoiceId(null);
    setSelectedSupplier(null);
    setSelectedProject(null);
  }, []);

  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeId) ?? sections[0],
    [activeId],
  );

  const selectedInvoice = useMemo(
    () => activeInvoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [activeInvoices, selectedInvoiceId],
  );

  useEffect(() => {
    store(INVOICES_KEY, invoiceRecords);
  }, [invoiceRecords]);
  useEffect(() => {
    store(EDITED_KEY, [...editedIds]);
  }, [editedIds]);
  useEffect(() => {
    store(LOG_KEY, changeLog);
  }, [changeLog]);
  useEffect(() => {
    store(NOTIFICATIONS_KEY, notifications);
  }, [notifications]);

  const selectSection = useCallback((id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    setSelectedInvoiceId(null);
    setSelectedSupplier(null);
    setSelectedProject(null);
  }, []);

  const openInvoice = useCallback((invoice: Invoice, origin: DetailOrigin) => {
    setSelectedInvoiceId(invoice.id);
    setDetailOrigin(origin);
  }, []);

  const saveInvoice = useCallback(
    (updated: Invoice, approvalRemarks?: string): string[] => {
      const current = invoiceRecords.find((invoice) => invoice.id === updated.id);
      if (!current) return [];
      const changes = describeInvoiceChanges(current, updated);
      if (changes.length === 0) return [];

      let notification: ApprovalNotification | null = null;
      if (isApprovalTransition(current, updated)) {
        notification = createApprovalNotification(
          updated,
          approvalRemarks ?? "",
          new Date().toISOString(),
        );
        if (!notification) return [];
        changes.push(
          `Notification to Payables Manager: "${notification.remarks}"`,
        );
      }
      if (current.status !== "Rejected" && updated.status === "Rejected" && approvalRemarks) {
        notification = createDecisionNotification(
          updated,
          "rejected",
          approvalRemarks,
          new Date().toISOString(),
        );
        changes.push(`Rejection remarks: "${approvalRemarks}"`);
        if (notification) {
          changes.push(`Notification to Payables Manager: "${notification.remarks}"`);
        }
      }
      if (
        updated.payablesReviewConfirmed &&
        !current.payablesReviewConfirmed &&
        validateInvoice(current, sampleSupplierFeed, sampleProjectFeed).level === "review"
      ) {
        changes.push("Payables team review confirmed (inactive supplier or project)");
      }

      setInvoiceRecords((records) =>
        records.map((invoice) => (invoice.id === updated.id ? updated : invoice)),
      );
      setEditedIds((ids) => new Set(ids).add(updated.id));
      if (notification) {
        setNotifications((items) => [notification as ApprovalNotification, ...items]);
      }
      setChangeLog((log) => [
        {
          id: `${Date.now()}-${updated.id}`,
          invoiceId: updated.id,
          invoiceNumber: updated.invoiceNumber,
          supplier: updated.supplier,
          at: new Date().toISOString(),
          changes,
        },
        ...log,
      ]);
      return changes;
    },
    [invoiceRecords],
  );

  const addInvoice = useCallback((invoice: Invoice) => {
    const validation = validateInvoice(invoice, sampleSupplierFeed, sampleProjectFeed);
    const stored: Invoice =
      validation.level === "invalid" ? { ...invoice, status: "Rejected" } : invoice;
    setInvoiceRecords((records) => [stored, ...records]);
    setChangeLog((log) => [
      {
        id: `${Date.now()}-${invoice.id}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplier: invoice.supplier,
        at: new Date().toISOString(),
        changes: [
          `Manual upload created from ${invoice.fileName} (${invoice.filePath})`,
          ...(validation.level === "invalid"
            ? [`Automatically rejected: ${INVALID_SUPPLIER_PROJECT_REMARKS}`]
            : []),
          ...(validation.level === "review"
            ? ["Payables team review required before approving or rejecting (inactive supplier or project)"]
            : []),
        ],
      },
      ...log,
    ]);
  }, []);

  const decideLiveInvoice = useCallback(
    async (
      invoice: Invoice,
      decision: "approve" | "reject",
      remarks: string,
      payablesReviewConfirmed: boolean,
    ): Promise<string[]> => {
      const headerId = invoice.id.startsWith("db-") ? Number(invoice.id.slice(3)) : Number.NaN;
      if (!Number.isInteger(headerId)) {
        throw new Error("Only Oracle invoices can be decided in Live mode.");
      }
      let response: Response;
      try {
        response = await fetch("/api/reviews/decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ headerId, decision, remarks }),
        });
      } catch {
        throw new Error(
          "The backend is not reachable. Start it with npm run server, then try again. Nothing was recorded in Oracle.",
        );
      }
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        oldStatus?: string;
        newStatus?: string;
        queued?: { status: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Oracle decision failed (${response.status})`);
      }
      const newStatus = data.newStatus === "Rejected" ? "Rejected" : "Approved";
      const at = new Date().toISOString();
      setLiveState((state) =>
        state.kind === "ready"
          ? {
              ...state,
              data: {
                ...state.data,
                invoices: state.data.invoices.map((item) =>
                  item.id === invoice.id
                    ? { ...item, status: newStatus, payablesReviewConfirmed }
                    : item,
                ),
              },
            }
          : state,
      );
      const notification = createDecisionNotification(
        { ...invoice, status: newStatus },
        decision === "approve" ? "approved" : "rejected",
        remarks,
        at,
      );
      if (notification) {
        setNotifications((items) => [notification as ApprovalNotification, ...items]);
      }
      const changes = [
        `Processing status: ${data.oldStatus ?? invoice.status} → ${newStatus}`,
        `Notification to Payables Manager: "${remarks.trim()}"`,
        ...(data.queued && data.queued.status === "queued"
          ? ["Queued for ERP pickup (erp_invoice_queue)."]
          : []),
      ];
      setChangeLog((log) => [
        {
          id: `${Date.now()}-${invoice.id}`,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          supplier: invoice.supplier,
          at,
          changes,
        },
        ...log,
      ]);
      return changes;
    },
    [],
  );

  const approveInvoice = useCallback(
    (
      invoice: Invoice,
      approvalRemarks: string,
      payablesReviewConfirmed: boolean,
    ): string[] | Promise<string[]> | void => {
      if (isLive) return decideLiveInvoice(invoice, "approve", approvalRemarks, payablesReviewConfirmed);
      return saveInvoice(
        { ...invoice, status: "Approved", payablesReviewConfirmed },
        approvalRemarks,
      );
    },
    [isLive, decideLiveInvoice, saveInvoice],
  );

  const rejectInvoice = useCallback(
    (
      invoice: Invoice,
      remarks: string,
      payablesReviewConfirmed: boolean,
    ): string[] | Promise<string[]> | void => {
      if (isLive) return decideLiveInvoice(invoice, "reject", remarks, payablesReviewConfirmed);
      return saveInvoice({ ...invoice, status: "Rejected", payablesReviewConfirmed }, remarks);
    },
    [isLive, decideLiveInvoice, saveInvoice],
  );

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
  }, []);

  const openNotificationInvoice = useCallback(
    (invoiceId: string) => {
      const invoice = invoiceRecords.find((item) => item.id === invoiceId);
      if (!invoice) return;
      setDataMode("sample");
      setActiveId("workbench");
      openInvoice(invoice, "workbench");
    },
    [invoiceRecords, openInvoice],
  );

  const resetData = useCallback(() => {
    setInvoiceRecords(sampleInvoices);
    setEditedIds(new Set());
    setChangeLog([]);
    setNotifications([]);
    setSelectedInvoiceId(null);
    try {
      window.localStorage.removeItem(INVOICES_KEY);
      window.localStorage.removeItem(EDITED_KEY);
      window.localStorage.removeItem(LOG_KEY);
      window.localStorage.removeItem(NOTIFICATIONS_KEY);
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    document.title = selectedInvoice
      ? `SIRE — ${selectedInvoice.invoiceNumber}`
      : `SIRE — ${activeSection.label}`;
  }, [activeSection, selectedInvoice]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const showDetail =
    selectedInvoice &&
    (activeId === "workbench" ||
      activeId === "actions" ||
      activeId === "suppliers" ||
      activeId === "projects");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <AppSidebar
        activeId={activeSection.id}
        open={sidebarOpen}
        notificationCount={unreadCount}
        onSelect={selectSection}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          pageTitle={activeSection.label}
          theme={theme}
          notificationCount={unreadCount}
          dataMode={dataMode}
          onDataModeChange={changeDataMode}
          engine={engine}
          onEngineChange={setEngine}
          onOpenSidebar={() => setSidebarOpen(true)}
          onToggleTheme={toggleTheme}
          onShowNotifications={() => selectSection("notifications")}
        />
        <main id="main" className="flex-1 px-4 py-7 sm:px-6 lg:py-9">
          {isLive && liveState.kind === "loading" && (
            <p className="mx-auto mb-6 w-full max-w-[1400px] rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
              Loading live data from Oracle…
            </p>
          )}
          {isLive && liveState.kind === "error" && (
            <div
              role="alert"
              className="mx-auto mb-6 w-full max-w-[1400px] rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              <strong>Live data unavailable.</strong> {liveState.message} Sample data is not being
              shown in Live mode. Switch the header toggle back to Sample, or fix the connection and
              switch again.
            </div>
          )}
          {isLive && liveState.kind === "ready" && liveData.invoices.length === 0 && (
            <p className="mx-auto mb-6 w-full max-w-[1400px] rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
              Live mode is connected to Oracle, but the live tables currently hold{" "}
              {liveData.suppliers.length} suppliers, {liveData.projects.length} projects, and 0
              invoices. Empty screens below mean the Oracle tables are empty — not that sample data
              is being shown.
            </p>
          )}
          {showDetail ? (
            <InvoiceDetail
              key={selectedInvoice.id}
              invoice={selectedInvoice}
              supplierFeed={activeSupplierFeed}
              projectFeed={activeProjectFeed}
              readOnly={isLive}
              liveDecisions={isLive}
              edited={!isLive && editedIds.has(selectedInvoice.id)}
              backLabel={
                detailOrigin === "actions"
                  ? "Back to My Actions"
                  : detailOrigin === "suppliers"
                    ? "Back to Suppliers"
                    : detailOrigin === "projects"
                      ? "Back to Projects"
                      : "Back to Invoice Workbench"
              }
              onBack={() => setSelectedInvoiceId(null)}
              onSave={saveInvoice}
              onApprove={approveInvoice}
              onReject={rejectInvoice}
            />
          ) : activeSection.id === "workbench" ? (
            <InvoiceWorkbench
              invoices={activeInvoices}
              dataMode={dataMode}
              engine={engine}
              supplierFeed={activeSupplierFeed}
              projectFeed={activeProjectFeed}
              onSelectInvoice={(invoice) => openInvoice(invoice, "workbench")}
              onAddInvoice={addInvoice}
            />
          ) : activeSection.id === "actions" ? (
            <MyActions
              invoices={activeInvoices}
              dataMode={dataMode}
              supplierFeed={activeSupplierFeed}
              projectFeed={activeProjectFeed}
              editedIds={isLive ? new Set<string>() : editedIds}
              changeLog={changeLog}
              onSelectInvoice={(invoice) => openInvoice(invoice, "actions")}
              onResetData={resetData}
            />
          ) : activeSection.id === "suppliers" ? (
            <Suppliers
              invoices={activeInvoices}
              supplierFeed={activeSupplierFeed}
              projectFeed={activeProjectFeed}
              selectedSupplier={selectedSupplier}
              onSelectSupplier={setSelectedSupplier}
              onSelectInvoice={(invoice) => openInvoice(invoice, "suppliers")}
              liveSources={isLive}
            />
          ) : activeSection.id === "projects" ? (
            <Projects
              invoices={activeInvoices}
              supplierFeed={activeSupplierFeed}
              projectFeed={activeProjectFeed}
              selectedProject={selectedProject}
              onSelectProject={setSelectedProject}
              onSelectInvoice={(invoice) => openInvoice(invoice, "projects")}
              liveSources={isLive}
            />
          ) : activeSection.id === "connections" ? (
            <Connections />
          ) : activeSection.id === "notifications" ? (
            <Notifications
              notifications={notifications}
              onMarkAllRead={markAllNotificationsRead}
              onOpenInvoice={openNotificationInvoice}
            />
          ) : (
            <EmptyState section={activeSection} />
          )}
        </main>
      </div>
    </div>
  );
}
