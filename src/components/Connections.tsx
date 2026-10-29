import { useEffect, useState } from "react";
import { CheckCircle2, Database, Loader2, Mail, MessageCircle, RefreshCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DbStatus {
  connected: boolean;
  user?: string;
  dsn?: string;
  walletConfigured?: boolean;
  schemaReady?: boolean;
  sireTablesPresent?: string[];
  sireTablesMissing?: string[];
  rowCounts?: Record<string, number>;
  note?: string;
  error?: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: DbStatus }
  | { kind: "unavailable" };

interface SourceStatus {
  connected: boolean;
  emailAddress?: string;
  messagesTotal?: number;
  status?: string;
  detail?: string;
  error?: string;
}

type SourceLoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: SourceStatus }
  | { kind: "unavailable" };

export function Connections() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [gmail, setGmail] = useState<SourceLoadState>({ kind: "loading" });
  const [whatsapp, setWhatsapp] = useState<SourceLoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setGmail({ kind: "loading" });
    setWhatsapp({ kind: "loading" });
    fetch("/api/db/status")
      .then((response) => {
        if (!response.ok) throw new Error("bad response");
        return response.json() as Promise<DbStatus>;
      })
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "unavailable" });
      });
    fetch("/api/sources/gmail")
      .then((response) => {
        if (!response.ok) throw new Error("bad response");
        return response.json() as Promise<SourceStatus>;
      })
      .then((data) => {
        if (!cancelled) setGmail({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setGmail({ kind: "unavailable" });
      });
    fetch("/api/sources/whatsapp")
      .then((response) => {
        if (!response.ok) throw new Error("bad response");
        return response.json() as Promise<SourceStatus>;
      })
      .then((data) => {
        if (!cancelled) setWhatsapp({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setWhatsapp({ kind: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <section aria-label="Connections" className="mx-auto w-full max-w-3xl">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
        Connections
      </p>
      <h2 className="mb-2 text-[28px] font-semibold leading-tight">Connections</h2>


      <div className="rounded-lg border bg-card p-5 text-card-foreground">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Database aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
          <h3 className="font-semibold">Oracle Database (wallet + .env)</h3>
          {state.kind === "loading" && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> Checking
            </Badge>
          )}
          {state.kind === "ready" && state.data.connected && (
            <Badge className="ml-auto gap-1 bg-teal text-white hover:bg-teal">
              <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> Connected
            </Badge>
          )}
          {(state.kind === "unavailable" || (state.kind === "ready" && !state.data.connected)) && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <XCircle aria-hidden="true" className="h-3 w-3" /> Not connected
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw aria-hidden="true" /> Re-check
          </Button>
        </div>

        {state.kind === "loading" && (
          <p className="text-sm text-muted-foreground">
            Connecting to Oracle with the wallet from <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>…
          </p>
        )}
        {state.kind === "unavailable" && (
          <p className="text-sm text-muted-foreground">
            The backend is not running, so the Oracle connection cannot be checked. Start it with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run server</code>. The app keeps
            using synthetic records meanwhile.
          </p>
        )}
        {state.kind === "ready" && !state.data.connected && (
          <p className="text-sm text-muted-foreground">
            Oracle did not connect
            {state.data.error ? `: ${state.data.error}` : "."} Check the wallet location and the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">DB_USER</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">DB_PSW</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">WALLET_LOC</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">CONFIG_DIR</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">DSN_ADB</code>, and{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">WALLET_PSW</code> values in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>.
          </p>
        )}
        {state.kind === "ready" && state.data.connected && (
          <div className="text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">User</dt>
                <dd>{state.data.user}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">DSN (TNS alias)</dt>
                <dd>{state.data.dsn}</dd>
              </div>
            </dl>

            {state.data.sireTablesMissing && state.data.sireTablesMissing.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-1 font-semibold">Tables not created yet</h4>
                <ul className="flex flex-wrap gap-1.5">
                  {state.data.sireTablesMissing.map((table) => (
                    <li key={table}>
                      <Badge variant="outline">{table}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {state.data.note &&
              state.data.note !== "Connected to Oracle and all SIRE tables from Tables.sql are present." && (
                <p className="mt-4 text-muted-foreground">{state.data.note}</p>
              )}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Mail aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
          <h3 className="font-semibold">Gmail (read-only)</h3>
          {gmail.kind === "loading" && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> Checking
            </Badge>
          )}
          {gmail.kind === "ready" && gmail.data.connected && (
            <Badge className="ml-auto gap-1 bg-teal text-white hover:bg-teal">
              <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> Connected
            </Badge>
          )}
          {(gmail.kind === "unavailable" || (gmail.kind === "ready" && !gmail.data.connected)) && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <XCircle aria-hidden="true" className="h-3 w-3" /> Not connected
            </Badge>
          )}
        </div>
        {gmail.kind === "loading" && (
          <p className="text-sm text-muted-foreground">Checking Gmail connection…</p>
        )}
        {gmail.kind === "unavailable" && (
          <p className="text-sm text-muted-foreground">
            The backend is not running, so the Gmail connection cannot be checked.
          </p>
        )}
        {gmail.kind === "ready" && gmail.data.connected && (
          <p className="text-sm text-muted-foreground">
            {gmail.data.emailAddress}
            {typeof gmail.data.messagesTotal === "number" && (
              <> · {gmail.data.messagesTotal.toLocaleString()} messages total</>
            )}
          </p>
        )}
        {gmail.kind === "ready" && !gmail.data.connected && (
          <p className="text-sm text-muted-foreground">
            Gmail is not connected{gmail.data.error ? `: ${gmail.data.error}` : "."}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <MessageCircle aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
          <h3 className="font-semibold">WhatsApp</h3>
          {whatsapp.kind === "loading" && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> Checking
            </Badge>
          )}
          {whatsapp.kind === "ready" && whatsapp.data.connected && (
            <Badge className="ml-auto gap-1 bg-teal text-white hover:bg-teal">
              <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> Connected
            </Badge>
          )}
          {(whatsapp.kind === "unavailable" ||
            (whatsapp.kind === "ready" && !whatsapp.data.connected)) && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <XCircle aria-hidden="true" className="h-3 w-3" /> Not connected
            </Badge>
          )}
        </div>
        {whatsapp.kind === "loading" && (
          <p className="text-sm text-muted-foreground">Checking WhatsApp connection…</p>
        )}
        {whatsapp.kind === "unavailable" && (
          <p className="text-sm text-muted-foreground">
            The backend is not running, so the WhatsApp connection cannot be checked.
          </p>
        )}
        {whatsapp.kind === "ready" && !whatsapp.data.connected && (
          <p className="text-sm text-muted-foreground">
            {whatsapp.data.detail ||
              (whatsapp.data.error
                ? `WhatsApp is not connected: ${whatsapp.data.error}`
                : "WhatsApp needs a WhatsApp Business or Twilio account.")}
          </p>
        )}
        {whatsapp.kind === "ready" && whatsapp.data.connected && (
          <p className="text-sm text-muted-foreground">
            {whatsapp.data.detail || "WhatsApp is connected."}
          </p>
        )}
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        ERP posting is not connected; approved invoices only queue locally.
      </p>
    </section>
  );
}
