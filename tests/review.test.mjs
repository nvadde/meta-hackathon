import assert from "node:assert/strict";
import test from "node:test";

import { invoiceSources, invoices, processingStatuses } from "../src/data/invoices.ts";
import {
  canApprove,
  createApprovalNotification,
  describeInvoiceChanges,
  deriveMyActions,
  isApprovalTransition,
} from "../src/lib/review.ts";

const base = invoices.find((invoice) => invoice.exceptionCount > 0) ?? invoices[0];

test("describeInvoiceChanges reports header and line corrections", () => {
  const corrected = {
    ...base,
    amount: base.amount + 100,
    exceptionCount: 0,
    status: "Matched",
    lines: base.lines.map((line, index) =>
      index === 0 ? { ...line, amount: line.amount + 100 } : line,
    ),
  };
  const changes = describeInvoiceChanges(base, corrected);
  assert.ok(changes.some((change) => change.startsWith("Amount:")), JSON.stringify(changes));
  assert.ok(changes.some((change) => change.startsWith("Exception count:")), JSON.stringify(changes));
  assert.ok(changes.some((change) => change.startsWith("Processing status:")), JSON.stringify(changes));
  assert.ok(changes.some((change) => change.startsWith("Lines updated:")), JSON.stringify(changes));
  assert.deepEqual(describeInvoiceChanges(base, base), []);
});

test("deriveMyActions flags exceptions, edits, and approved invoices", () => {
  const exceptionInvoice = invoices.find((invoice) => invoice.exceptionCount > 0);
  assert.ok(exceptionInvoice, "synthetic data must include an exception invoice");
  const approved = { ...invoices[0], status: "Approved", exceptionCount: 0 };
  const items = deriveMyActions([exceptionInvoice, approved], new Set([approved.id]));
  const byId = new Map(items.map((item) => [item.invoice.id, item.kinds]));
  assert.ok(byId.get(exceptionInvoice.id)?.includes("needs-review"));
  assert.ok(byId.get(approved.id)?.includes("approved"));
  assert.ok(byId.get(approved.id)?.includes("edited"));
});

test("source LOV is Gmail, WhatsApp, and Manual Upload only", () => {
  assert.deepEqual(invoiceSources, ["Gmail", "WhatsApp", "Manual Upload"]);
  assert.ok(invoices.some((invoice) => invoice.source === "Manual Upload"));
  assert.ok(invoices.every((invoice) => invoiceSources.includes(invoice.source)));
});

test("processing status LOV includes Rejected and Approved", () => {
  assert.ok(processingStatuses.includes("Rejected"));
  assert.ok(processingStatuses.includes("Approved"));
});

test("approval requires remarks and notifies Payables Manager only on transition to Approved", () => {
  const before = { ...base, status: "Matched" };
  const after = { ...before, status: "Approved" };
  assert.equal(isApprovalTransition(before, after), true);
  assert.equal(isApprovalTransition(after, after), false);
  assert.equal(isApprovalTransition(before, { ...before, status: "Rejected" }), false);

  assert.equal(createApprovalNotification(after, "   ", "2026-10-27T10:00:00.000Z"), null);
  const notification = createApprovalNotification(
    after,
    "  Verified against PO and delivery note.  ",
    "2026-10-27T10:00:00.000Z",
  );
  assert.equal(notification.to, "Payables Manager");
  assert.equal(notification.remarks, "Verified against PO and delivery note.");
  assert.equal(notification.invoiceId, after.id);
  assert.equal(notification.invoiceNumber, after.invoiceNumber);
  assert.equal(notification.read, false);
});

test("canApprove requires zero exceptions and lines matching the header amount", () => {
  const clean = {
    ...base,
    exceptionCount: 0,
    status: "Matched",
    amount: base.lines.reduce((sum, line) => sum + line.amount, 0),
  };
  assert.equal(canApprove(clean), true);
  assert.equal(canApprove({ ...clean, exceptionCount: 1 }), false);
  assert.equal(canApprove({ ...clean, amount: clean.amount + 1 }), false);
  assert.equal(canApprove({ ...clean, status: "Approved" }), false);
});
