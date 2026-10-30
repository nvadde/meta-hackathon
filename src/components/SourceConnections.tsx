import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, MessageCircle, Upload, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

interface GmailStatus {
  connected: boolean;
  emailAddress?: string;
  messagesTotal?: number;
  recentMessages?: GmailMessage[];
  error?: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: GmailStatus }
  | { kind: "unavailable" };

interface SyncProgress {
  stage: "idle" | "reading" | "converting" | "inserting" | "done" | "error";
  detail?: string;
  file?: string;
  at?: string | null;
}

const SYNC_STEPS = [
  "Reading emails from Gmail",
  "Converting PDF to JSON",
  "Inserting into Oracle",
  "Showing on dashboard",
] as const;

export function SourceConnections({
  engine,
  onUpload,
  onSynced,
}: {
  engine: "llama" | "react";
  onUpload: () => void;
  onSynced?: () => Promise<unknown> | unknown;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress>({ stage: "idle" });
  const [dashboardShown, setDashboardShown] = useState(false);

  async function pollProgress() {
    try {
      const response = await fetch("/api/sources/gmail/sync/progress");
      const data = await response.json();
      if (data?.progress) setProgress(data.progress as SyncProgress);
    } catch {
      // Progress polling is best-effort; the sync result carries the outcome.
    }
  }

  async function syncGmailToOracle() {
    setSyncing(true);
    setSyncMessage(null);
    setDashboardShown(false);
    setProgress({ stage: "reading", detail: "Sync started." });
    const timer = window.setInterval(pollProgress, 1500);
    try {
      const response = await fetch("/api/sources/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: engine }),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || "Sync failed");
      await pollProgress();
      await onSynced?.();
      setDashboardShown(true);
      const notes = (data.notes || []).join("; ");
      const errors = (data.errors || []).join("; ");
      setSyncMessage(
        `Sync done (${engine === "react" ? "ReAct" : "Llama"}): ${data.imported} imported, ${data.skipped} skipped, ${data.checked} checked.` +
          (errors ? ` Errors: ${errors}` : " Switch the header toggle to Live to review them.") +
          (notes ? ` Notes: ${notes}` : ""),
      );
    } catch (error) {
      await pollProgress();
      setSyncMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      window.clearInterval(timer);
      setSyncing(false);
    }
  }

  const activeStep =
    progress.stage === "converting" ? 1 : progress.stage === "inserting" ? 2 : progress.stage === "done" ? 3 : 0;
  const finishedStep = progress.stage === "done" && dashboardShown ? SYNC_STEPS.length : activeStep;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sources/gmail")
      .then((response) => {
        if (!response.ok) throw new Error("bad response");
        return response.json() as Promise<GmailStatus>;
      })
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="Source connections" className="mb-6 grid gap-3 lg:grid-cols-3">
      <div className="rounded-lg border bg-card px-3 py-2.5 text-card-foreground">
        <div className="flex items-center gap-2">
          <Mail aria-hidden="true" className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <h3 className="font-semibold">Gmail</h3>
          {state.kind === "loading" && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> Checking
            </Badge>
          )}
          {state.kind === "ready" && state.data.connected && (
            <Badge className="ml-auto gap-1 bg-teal text-white hover:bg-teal">
              <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> Connected, read-only
            </Badge>
          )}
          {(state.kind === "unavailable" || (state.kind === "ready" && !state.data.connected)) && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <XCircle aria-hidden="true" className="h-3 w-3" /> Not connected
            </Badge>
          )}
        </div>

        {state.kind === "unavailable" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Backend not running — start it with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run server</code>.
          </p>
        )}
        {state.kind === "ready" && !state.data.connected && (
          <p className="mt-1 text-sm text-muted-foreground">
            Not connected{state.data.error ? `: ${state.data.error}` : "."}
          </p>
        )}
        {state.kind === "ready" && state.data.connected && (
          <div>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.data.emailAddress}
              {typeof state.data.messagesTotal === "number" && (
                <> · {state.data.messagesTotal.toLocaleString()} total</>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={syncing}
                onClick={syncGmailToOracle}
                className="rounded-md bg-teal px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {syncing ? "Syncing…" : "Sync to Oracle"}
              </button>
            </div>
            {(syncing || progress.stage === "done" || progress.stage === "error") &&
              progress.stage !== "idle" && (
                <ol className="mt-2 space-y-1 text-sm" aria-live="polite">
                  {SYNC_STEPS.map((label, index) => {
                    const done = index < finishedStep;
                    const active = index === finishedStep && syncing;
                    return (
                      <li key={label} className="flex items-center gap-2">
                        {done ? (
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-teal-dark dark:text-teal" />
                        ) : active ? (
                          <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-teal-dark dark:text-teal" />
                        ) : (
                          <span aria-hidden="true" className="grid h-4 w-4 shrink-0 place-items-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                          </span>
                        )}
                        <span className={done || active ? "text-foreground" : "text-muted-foreground"}>
                          {label}
                          {active && progress.detail ? ` — ${progress.detail}` : ""}
                        </span>
                      </li>
                    );
                  })}
                  {progress.stage === "error" && progress.detail && (
                    <li className="text-sm text-red-700 dark:text-red-300">Sync failed: {progress.detail}</li>
                  )}
                </ol>
              )}
            {syncMessage && <p className="mt-1 text-sm text-muted-foreground">{syncMessage}</p>}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card px-3 py-2.5 text-card-foreground">
        <div className="flex items-center gap-2">
          <Upload aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
          <h3 className="font-semibold">Manual Upload</h3>
          <Badge variant="secondary" className="ml-auto">
            Source channel
          </Badge>
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={onUpload}
            className="rounded-md bg-teal px-3 py-1.5 text-sm font-medium text-white"
          >
            Upload invoice PDF
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-card px-3 py-2.5 text-card-foreground">
        <div className="flex items-center gap-2">
          <MessageCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <h3 className="font-semibold">WhatsApp</h3>
          <Badge variant="secondary" className="ml-auto">
            Setup pending
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Needs a WhatsApp Business or Twilio token.</p>
      </div>
    </section>
  );
}
