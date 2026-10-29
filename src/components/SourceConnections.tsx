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

export function SourceConnections({
  engine,
  onUpload,
}: {
  engine: "llama" | "react";
  onUpload: () => void;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function syncGmailToOracle() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch("/api/sources/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: engine }),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || "Sync failed");
      const notes = (data.notes || []).join("; ");
      setSyncMessage(
        `Sync done (${engine === "react" ? "ReAct" : "Llama"}): ${data.imported} imported, ${data.skipped} skipped, ${data.checked} checked.` +
          (data.errors?.length ? ` Errors: ${data.errors.length}.` : " Switch the header toggle to Live to review them.") +
          (notes ? ` Notes: ${notes}` : ""),
      );
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

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
