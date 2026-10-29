import { Bell, Menu, Moon, Sun } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type DataMode = "sample" | "live";

export type ConversionEngine = "llama" | "react";

interface TopBarProps {
  pageTitle: string;
  theme: "light" | "dark";
  notificationCount: number;
  dataMode: DataMode;
  onDataModeChange: (mode: DataMode) => void;
  engine: ConversionEngine;
  onEngineChange: (engine: ConversionEngine) => void;
  onOpenSidebar: () => void;
  onToggleTheme: () => void;
  onShowNotifications: () => void;
}

export function TopBar({
  pageTitle,
  theme,
  notificationCount,
  dataMode,
  onDataModeChange,
  engine,
  onEngineChange,
  onOpenSidebar,
  onToggleTheme,
  onShowNotifications,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-card px-4 py-3 text-card-foreground sm:px-6">
      <Button
        variant="outline"
        size="icon"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
        className="lg:hidden"
      >
        <Menu aria-hidden="true" />
      </Button>

      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold leading-tight">
          SIRE <span className="font-normal text-muted-foreground">— {pageTitle}</span>
        </h1>
        <p className="hidden truncate text-sm text-muted-foreground sm:block">
          Smart Ingestion &amp; Reconciliation Engine
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div
          role="group"
          aria-label="Data source"
          className="flex items-center rounded-md border border-input bg-card p-0.5"
        >
          <span className="hidden px-2 text-xs font-semibold text-muted-foreground xl:inline">
            Data:
          </span>
          {(["sample", "live"] as DataMode[]).map((mode) => {
            const active = dataMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onDataModeChange(mode)}
                aria-pressed={active}
                title={
                  mode === "live"
                    ? "Show live data read from Oracle"
                    : "Show clearly labeled sample (synthetic) data"
                }
                className={
                  active
                    ? "rounded-[5px] bg-teal px-2.5 py-1.5 text-xs font-bold capitalize text-white"
                    : "rounded-[5px] px-2.5 py-1.5 text-xs font-semibold capitalize text-muted-foreground hover:text-foreground"
                }
              >
                {mode}
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="Conversion engine"
          className="flex items-center rounded-md border border-input bg-card p-0.5"
        >
          <span className="hidden px-2 text-xs font-semibold text-muted-foreground xl:inline">
            Convert:
          </span>
          {(
            [
              { value: "llama", label: "Llama", hint: "Direct single-pass PDF extraction" },
              { value: "react", label: "ReAct", hint: "Agentic validated loop (InvoiceSchema)" },
            ] as const
          ).map((option) => {
            const active = engine === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onEngineChange(option.value)}
                aria-pressed={active}
                title={option.hint}
                className={
                  active
                    ? "rounded-[5px] bg-teal px-2.5 py-1.5 text-xs font-bold text-white"
                    : "rounded-[5px] px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <Badge
          variant="secondary"
          className="hidden bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal md:inline-flex"
        >
          {dataMode === "live" ? "Live: Oracle" : "Sample data"}
        </Badge>

        <Button
          variant="outline"
          size="icon"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={onShowNotifications}
          aria-label={
            notificationCount > 0
              ? `Notifications, ${notificationCount} unread`
              : "Notifications, no unread"
          }
          className="relative"
        >
          <Bell aria-hidden="true" />
          {notificationCount > 0 && (
            <>
              <span
                aria-hidden="true"
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card"
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-teal px-1 text-[11px] font-bold text-white"
              >
                {notificationCount}
              </span>
            </>
          )}
        </Button>
      </div>
    </header>
  );
}
