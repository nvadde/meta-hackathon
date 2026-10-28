import { useEffect, useState } from "react";
import { CheckCircle2, Database, Loader2, RefreshCw, XCircle } from "lucide-react";

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

export function Connections() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
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
      <p className="mb-6 max-w-[65ch] text-muted-foreground">
        External connections used by SIRE. Credentials stay on the local backend and are never shown
        here or sent to the browser.
      </p>

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
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wallet</dt>
                <dd>{state.data.walletConfigured ? "Configured from .env" : "Not configured"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SIRE schema (Tables.sql)</dt>
                <dd>{state.data.schemaReady ? "All tables present" : "Tables missing — see below"}</dd>
              </div>
            </dl>

            {state.data.sireTablesPresent && state.data.sireTablesPresent.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-1 font-semibold">Tables present</h4>
                <ul className="flex flex-wrap gap-1.5">
                  {state.data.sireTablesPresent.map((table) => (
                    <li key={table}>
                      <Badge variant="secondary">
                        {table}: {state.data.rowCounts?.[table] ?? 0} rows
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
            {state.data.note && <p className="mt-4 text-muted-foreground">{state.data.note}</p>}
          </div>
        )}
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Gmail (read-only) is shown on the Invoice Workbench. WhatsApp still needs a WhatsApp Business
        or Twilio account. ERP posting is not connected; approved invoices only queue locally.
      </p>
    </section>
  );
}
