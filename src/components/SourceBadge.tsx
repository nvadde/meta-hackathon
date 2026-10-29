import { Mail, MessageCircle, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { InvoiceSource } from "@/data/invoices";
import { cn } from "@/lib/utils";

const sourceStyles: Record<InvoiceSource, { icon: typeof Mail; className: string }> = {
  Gmail: {
    icon: Mail,
    className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  },
  WhatsApp: {
    icon: MessageCircle,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  },
  "Manual Upload": {
    icon: Upload,
    className: "border-border bg-secondary text-secondary-foreground",
  },
};

export function SourceBadge({ source, live = false }: { source: InvoiceSource; live?: boolean }) {
  const { icon: Icon, className } = sourceStyles[source] ?? sourceStyles["Manual Upload"];
  const label = live ? `${source} (live source channel from Oracle)` : `${source} (sample source label, not a live connection)`;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 whitespace-nowrap px-1.5", className)}
      title={label}
      aria-label={`Source channel: ${label}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="sr-only">{label}</span>
    </Badge>
  );
}
