import { Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Invoice } from "@/data/invoices";
import { formatAmount } from "@/lib/format";

function queueLabel(invoice: Invoice): string {
  if (!invoice.queueStatus) return "Not queued";
  return invoice.queueStatus;
}

export function Published({
  invoices,
  onSelectInvoice,
}: {
  invoices: Invoice[];
  onSelectInvoice: (invoice: Invoice) => void;
}) {
  const published = invoices.filter((invoice) => invoice.status === "Approved");

  return (
    <section aria-label="Published" className="mx-auto w-full max-w-[1400px]">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
        Published
      </p>
      <h2 className="mb-2 text-[28px] font-semibold leading-tight">Published</h2>
      <p className="mb-6 max-w-[75ch] text-muted-foreground">
        Approved invoices only. Any ERP picks a queued row up and writes back
        CREATED with its own invoice number (or FAILED with a reason).
      </p>

      {published.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center text-card-foreground">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-[10px] bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal"
          >
            <Send className="h-[26px] w-[26px]" strokeWidth={1.8} />
          </div>
          <h3 className="mb-2 text-lg font-semibold">No approved invoices</h3>
          <p className="mx-auto mb-0 max-w-[52ch] text-muted-foreground">
            Approved invoices appear here with their ERP pickup state. Nothing
            has been approved yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card text-card-foreground">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/60 text-[13px]">
                <th scope="col" className="px-3 py-2.5 font-semibold">Invoice</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Supplier</th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-right">Amount</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Pickup state</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">ERP invoice</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  <span className="sr-only">View invoice</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {published.map((invoice) => (
                <tr key={invoice.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => onSelectInvoice(invoice)}
                      aria-label={`View invoice ${invoice.invoiceNumber}`}
                      className="font-medium text-teal-dark underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-teal"
                    >
                      {invoice.invoiceNumber}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{invoice.supplier}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                    {formatAmount(invoice.amount, invoice.currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Badge variant="secondary">{queueLabel(invoice)}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {invoice.erpInvoiceId || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Button size="sm" variant="outline" onClick={() => onSelectInvoice(invoice)}>
                      View invoice
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        No ERP configured inside SIRE, banking details stay in the ERP.
      </p>
    </section>
  );
}
