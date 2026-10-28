import {
  Bell,
  Building2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Link2,
  ListChecks,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
  heading: string;
  lead: string;
  emptyTitle: string;
  emptyText: string;
}

export const sections: Section[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    heading: "Welcome to SIRE",
    lead: "A summary of supplier invoice activity across your projects will live here.",
    emptyTitle: "No activity yet",
    emptyText:
      "When supplier invoices are received and processed, totals, recent activity, and items needing attention will appear here.",
  },
  {
    id: "workbench",
    label: "Invoice Workbench",
    icon: Inbox,
    heading: "Invoice Workbench",
    lead: "Supplier invoices received by email will be listed here for review.",
    emptyTitle: "No invoices received",
    emptyText:
      "No supplier invoices have arrived yet. When ingestion is enabled in a later step, new invoices will appear here.",
  },
  {
    id: "actions",
    label: "My Actions",
    icon: ListChecks,
    heading: "My Actions",
    lead: "Approvals and tasks assigned to you will be collected here.",
    emptyTitle: "No actions assigned",
    emptyText:
      "You have no pending approvals or tasks. Items that need your attention will appear here.",
  },
  {
    id: "suppliers",
    label: "Suppliers",
    icon: Building2,
    heading: "Suppliers",
    lead: "Vendor profiles used to match invoices will be managed here.",
    emptyTitle: "No suppliers added",
    emptyText:
      "No vendor profiles exist yet. Suppliers will appear here once they are set up in a later step.",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    heading: "Projects",
    lead: "Construction and infrastructure projects and their milestones will be tracked here.",
    emptyTitle: "No projects yet",
    emptyText:
      "No projects have been created. Active projects and their milestones will appear here in a later step.",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    heading: "Notifications",
    lead: "Alerts about invoices, approvals, and system activity will be shown here.",
    emptyTitle: "No notifications",
    emptyText:
      "You have no notifications. The indicator in the top bar is part of the shell, and real alerts will appear here later.",
  },
  {
    id: "connections",
    label: "Connections",
    icon: Link2,
    heading: "Connections",
    lead: "Email, ERP, and other external connections will be configured here.",
    emptyTitle: "No connections configured",
    emptyText:
      "No integrations are connected yet. Email and ERP connections will be added in a later step.",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    heading: "Settings",
    lead: "Workspace preferences and configuration will live here.",
    emptyTitle: "Nothing to configure yet",
    emptyText:
      "There are no settings in the shell. Configuration options will be introduced with later features. Use the theme toggle in the top bar to preview light and dark modes.",
  },
];
