import assert from "node:assert/strict";
import test from "node:test";

import { invoices } from "../src/data/invoices.ts";
import { projectFeed } from "../src/data/projects.ts";
import { supplierFeed } from "../src/data/suppliers.ts";
import {
  INVALID_SUPPLIER_PROJECT_REMARKS,
  PAYABLES_CONTACT,
  decisionGate,
  validateInvoice,
} from "../src/lib/validation.ts";

const bySupplier = (name) => invoices.find((invoice) => invoice.supplier === name);
const base = invoices[0];

test("unknown supplier or project is invalid and must be rejected with the contact remarks", () => {
  const badSupplier = validateInvoice({ ...base, supplier: "Unknown Supplier Ltd" }, supplierFeed, projectFeed);
  assert.equal(badSupplier.level, "invalid");
  assert.match(badSupplier.issues.join(" "), /supplier/i);
  assert.ok(badSupplier.supplierHint, "a closest master match is suggested");

  // Project is not validated: unknown or blank projects still pass.
  const badProject = validateInvoice(
    { ...base, project: "Unknown Project", projectNumber: "PRJ-999" },
    supplierFeed,
    projectFeed,
  );
  assert.equal(badProject.level, "ok");

  const blankProject = validateInvoice(
    { ...base, project: "", projectNumber: "" },
    supplierFeed,
    projectFeed,
  );
  assert.equal(blankProject.level, "ok");

  assert.match(INVALID_SUPPLIER_PROJECT_REMARKS, /not a valid supplier or project/i);
  assert.equal(PAYABLES_CONTACT, "payablesmanager@sire.com");
  assert.match(INVALID_SUPPLIER_PROJECT_REMARKS, /payablesmanager@sire\.com/);
});

test("whitespace and empty-master cases stay passable via review", () => {
  const doubleSpace = validateInvoice(
    { ...base, supplier: "Atlas  Concrete   Ltd" },
    supplierFeed,
    projectFeed,
  );
  assert.equal(doubleSpace.level, "ok");

  const unloaded = validateInvoice({ ...base, supplier: "KATH FUEL OIL SERVICE CO" }, [], projectFeed);
  assert.equal(unloaded.level, "invalid");
  assert.equal(unloaded.supplierUnverified, true);
  assert.match(unloaded.issues.join(" "), /did not load/i);

  const gate = decisionGate({ ...base, supplier: "KATH FUEL OIL SERVICE CO" }, [], projectFeed, false);
  assert.equal(gate.canApprove, false);
  assert.match(gate.reasons.join(" "), /did not load/i);
  const confirmed = decisionGate({ ...base, supplier: "KATH FUEL OIL SERVICE CO" }, [], projectFeed, true);
  assert.equal(confirmed.canApprove, true);
});

test("inactive supplier needs payables team review, project status is ignored, active records pass", () => {
  const inactiveSupplier = bySupplier("Cedar Formwork Co");
  assert.ok(inactiveSupplier, "sample data must include an inactive supplier invoice");
  assert.equal(validateInvoice(inactiveSupplier, supplierFeed, projectFeed).level, "review");

  const airportInvoice = invoices.find((invoice) => invoice.project === "Airport Link Road");
  assert.ok(airportInvoice, "sample data must include an inactive project invoice");
  assert.equal(validateInvoice(airportInvoice, supplierFeed, projectFeed).level, "ok");

  const active = bySupplier("Atlas Concrete Ltd");
  assert.equal(validateInvoice(active, supplierFeed, projectFeed).level, "ok");
});

test("decision gate: invalid can only be rejected, inactive needs confirmed review first", () => {
  const invalid = { ...base, supplier: "Unknown Supplier Ltd" };
  let gate = decisionGate(invalid, supplierFeed, projectFeed, false);
  assert.equal(gate.canApprove, false);
  assert.equal(gate.canReject, true);

  const inactive = bySupplier("Cedar Formwork Co");
  gate = decisionGate(inactive, supplierFeed, projectFeed, false);
  assert.equal(gate.canApprove, false);
  assert.equal(gate.canReject, false);
  assert.match(gate.reasons.join(" "), /payables team/i);

  gate = decisionGate(inactive, supplierFeed, projectFeed, true);
  assert.equal(gate.canApprove, true);
  assert.equal(gate.canReject, true);

  const active = bySupplier("Atlas Concrete Ltd");
  gate = decisionGate(active, supplierFeed, projectFeed, false);
  assert.equal(gate.canApprove, true);
  assert.equal(gate.canReject, true);
});

test("decision gate: invalid invoices can be approved once payables review is confirmed", () => {
  const invalid = { ...base, supplier: "Unknown Supplier Ltd" };
  let gate = decisionGate(invalid, supplierFeed, projectFeed, true);
  assert.equal(gate.canApprove, true);
  assert.equal(gate.canReject, true);

  gate = decisionGate({ ...invalid, payablesReviewConfirmed: true }, supplierFeed, projectFeed, false);
  assert.equal(gate.canApprove, true);
  assert.equal(gate.canReject, true);
});

test("supplier matching is case-insensitive and name-only", () => {
  const lowerSupplier = validateInvoice(
    { ...base, supplier: "atlas concrete ltd" },
    supplierFeed,
    projectFeed,
  );
  assert.equal(lowerSupplier.level, "ok");

  const byNumberOnly = validateInvoice(
    { ...base, supplier: "SUP-101" },
    [{ ...supplierFeed[0], supplierNumber: "SUP-101" }],
    projectFeed,
  );
  assert.equal(byNumberOnly.level, "invalid");
  assert.ok(byNumberOnly.issues.some((issue) => issue.includes("SUP-101")));
});

test("structural problems are invalid: blank number, bad amount, mismatched totals", () => {
  const blankNumber = validateInvoice(
    { ...base, invoiceNumber: "  " },
    supplierFeed,
    projectFeed,
  );
  assert.equal(blankNumber.level, "invalid");
  assert.ok(blankNumber.issues.includes("Invoice number is blank."));

  const badAmount = validateInvoice({ ...base, amount: 0 }, supplierFeed, projectFeed);
  assert.equal(badAmount.level, "invalid");
  assert.ok(badAmount.issues.includes("Amount due is not a valid non-zero number."));

  const mismatch = validateInvoice({ ...base, amount: base.amount + 500 }, supplierFeed, projectFeed);
  assert.equal(mismatch.level, "invalid");
  assert.ok(mismatch.issues.some((issue) => issue.includes("does not match the lines total")));

  const creditMemo = validateInvoice(
    invoices.find((invoice) => invoice.id === "inv-1007"),
    supplierFeed,
    projectFeed,
  );
  assert.equal(creditMemo.level, "ok");
});
