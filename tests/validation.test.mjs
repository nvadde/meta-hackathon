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

  const badProject = validateInvoice({ ...base, project: "Unknown Project" }, supplierFeed, projectFeed);
  assert.equal(badProject.level, "invalid");
  assert.match(badProject.issues.join(" "), /project/i);

  const blankProject = validateInvoice({ ...base, project: "" }, supplierFeed, projectFeed);
  assert.equal(blankProject.level, "invalid");

  assert.match(INVALID_SUPPLIER_PROJECT_REMARKS, /not a valid supplier or project/i);
  assert.equal(PAYABLES_CONTACT, "payablesmanager@sire.com");
  assert.match(INVALID_SUPPLIER_PROJECT_REMARKS, /payablesmanager@sire\.com/);
});

test("inactive supplier or project needs payables team review, active records pass", () => {
  const inactiveSupplier = bySupplier("Cedar Formwork Co");
  assert.ok(inactiveSupplier, "sample data must include an inactive supplier invoice");
  assert.equal(validateInvoice(inactiveSupplier, supplierFeed, projectFeed).level, "review");

  const airportInvoice = invoices.find((invoice) => invoice.project === "Airport Link Road");
  assert.ok(airportInvoice, "sample data must include an inactive project invoice");
  assert.equal(validateInvoice(airportInvoice, supplierFeed, projectFeed).level, "review");

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
