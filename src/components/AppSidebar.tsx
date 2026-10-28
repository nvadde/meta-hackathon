import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sections } from "@/data/sections";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  activeId: string;
  open: boolean;
  notificationCount: number;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function AppSidebar({ activeId, open, notificationCount, onSelect, onClose }: AppSidebarProps) {
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-navy-deep/60 lg:hidden",
          open ? "block" : "hidden",
        )}
      />
      <aside
        aria-label="Primary"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col bg-navy text-navy-text transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 pb-5 pt-5">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal text-lg font-bold text-white"
          >
            S
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-bold leading-tight tracking-wide text-white">
              SIRE
            </span>
            <span className="block truncate text-xs text-navy-muted">
              Supplier payments
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto text-navy-text hover:bg-navy-raised hover:text-white lg:hidden"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <nav aria-label="SIRE sections" className="flex flex-col gap-1 px-3 py-4">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = section.id === activeId;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                  active
                    ? "bg-teal font-semibold text-white"
                    : "text-navy-text hover:bg-navy-raised hover:text-white",
                )}
              >
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span className="truncate">{section.label}</span>
                {section.id === "notifications" && notificationCount > 0 && (
                  <span
                    aria-label={`${notificationCount} unread notifications`}
                    className="ml-auto shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
                  >
                    {notificationCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <p className="mt-auto border-t border-white/10 px-5 py-4 text-xs leading-relaxed text-navy-muted">
          Shell preview only.
          <br />
          No invoice, ERP, or database features yet.
        </p>
      </aside>
    </>
  );
}
