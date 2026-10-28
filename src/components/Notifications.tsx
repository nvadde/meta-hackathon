import { Bell, CheckCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApprovalNotification } from "@/lib/review";

export function Notifications({
  notifications,
  onMarkAllRead,
  onOpenInvoice,
}: {
  notifications: ApprovalNotification[];
  onMarkAllRead: () => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const unread = notifications.filter((notification) => !notification.read).length;

  return (
    <section aria-label="Notifications" className="mx-auto w-full max-w-3xl">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <p className="text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
          Notifications
        </p>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={onMarkAllRead} className="ml-auto">
            <CheckCheck aria-hidden="true" /> Mark all as read
          </Button>
        )}
      </div>
      <h2 className="mb-2 text-[28px] font-semibold leading-tight">Notifications</h2>
      <p className="mb-6 max-w-[65ch] text-muted-foreground">
        In-app notifications for Payables Manager. Approving an invoice creates one here with the
        approver&apos;s remarks/comments. No email or external message is sent.
      </p>

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center text-card-foreground">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-[10px] bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal"
          >
            <Bell className="h-[26px] w-[26px]" strokeWidth={1.8} />
          </div>
          <h3 className="mb-2 text-lg font-semibold">No notifications</h3>
          <p className="mx-auto max-w-[52ch] text-muted-foreground">
            When an invoice is approved, a notification to Payables Manager with the approval remarks
            will appear here.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className="rounded-lg border bg-card p-4 text-card-foreground"
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong>
                  {notification.type}: {notification.invoiceNumber} — {notification.supplier}
                </strong>
                {!notification.read && (
                  <Badge className="bg-teal text-white hover:bg-teal">New</Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(notification.at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                To: {notification.to} · In-app notification (no email sent)
              </p>
              <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">
                Remarks: “{notification.remarks}”
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => onOpenInvoice(notification.invoiceId)}
              >
                Open invoice
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
