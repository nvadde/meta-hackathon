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

export function SourceConnections() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

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
    <section aria-label="Source connections" className="mb-6 grid gap-4 lg:grid-cols-3">
      <div className="rounded-lg border bg-card p-4 text-card-foreground">
        <div className="mb-2 flex items-center gap-2">
          <Mail aria-hidden="true" className="h-5 w-5 text-red-600 dark:text-red-400" />
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

        {state.kind === "loading" && (
          <p className="text-sm text-muted-foreground">Checking the live Gmail connection…</p>
        )}
        {state.kind === "unavailable" && (
          <p className="text-sm text-muted-foreground">
            The Gmail backend is not running, so live mailbox data cannot be shown. Start it with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run server</code> alongside the
            dev server. The synthetic invoice records below are unaffected.
          </p>
        )}
        {state.kind === "ready" && !state.data.connected && (
          <p className="text-sm text-muted-foreground">
            Gmail did not connect{state.data.error ? `: ${state.data.error}` : "."} Check that{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">credentials.json</code> and{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">token.json</code> are present.
          </p>
        )}
        {state.kind === "ready" && state.data.connected && (
          <div>
            <p className="text-sm text-muted-foreground">
              Mailbox <span className="font-medium text-foreground">{state.data.emailAddress}</span>
              {typeof state.data.messagesTotal === "number" && (
                <> · {state.data.messagesTotal.toLocaleString()} messages total</>
              )}
              . Recent message subjects are shown live below. No invoice extraction runs yet.
            </p>
            {state.data.recentMessages && state.data.recentMessages.length > 0 && (
              <ul className="mt-3 space-y-2">
                {state.data.recentMessages.slice(0, 5).map((message) => (
                  <li key={message.id} className="rounded-md border px-3 py-2 text-sm">
                    <span className="block truncate font-medium">{message.subject || "(no subject)"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {message.from} · {message.date}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4 text-card-foreground">
        <div className="mb-2 flex items-center gap-2">
          <Upload aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Manual Upload</h3>
          <Badge variant="secondary" className="ml-auto">
            Source channel
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Manual Upload is the source channel for invoices you upload yourself with the panel below,
          instead of arriving by Gmail or WhatsApp. Use <strong>Upload invoice PDF</strong> there to add
          one.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 text-card-foreground">
        <div className="mb-2 flex items-center gap-2">
          <MessageCircle aria-hidden="true" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h3 className="font-semibold">WhatsApp</h3>
          <Badge variant="secondary" className="ml-auto">
            Setup pending
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          WhatsApp is not connected. A phone number alone cannot receive messages — this needs a
          WhatsApp Business (Meta) or Twilio account with an access token. Until those credentials are
          supplied, WhatsApp badges on the synthetic records below are sample labels only, and no
          WhatsApp messages are sent or received.
        </p>
      </div>
    </section>
  );
}
