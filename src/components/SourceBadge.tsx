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

export function SourceBadge({ source }: { source: InvoiceSource }) {
  const { icon: Icon, className } = sourceStyles[source];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 whitespace-nowrap", className)}
      title={`${source} (sample source label, not a live connection)`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {source}
    </Badge>
  );
}
