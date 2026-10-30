import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INVOICE_TYPE_CREDIT_MEMO,
  INVOICE_TYPE_STANDARD,
  STATUS_EXCEPTION,
  STATUS_MATCHED,
  classifyInvoiceType,
  validateInvoiceDraft,
  validationRules,
} from "../invoiceSource/invoice-validation.mjs";

const masters = {
  suppliers: [
    { id: 11, name: "Acme Corp", number: "SUP-8899" },
    { id: 12, name: "Northgate Steelworks", number: "SUP-1024" },
  ],
  projects: [
    { id: 201, name: "Riverside Tower", number: "PRJ-992" },
    { id: 202, name: "Airport Link Road", number: "PRJ-410" },
  ],
  invoices: [],
};

const validDraft = () => ({
  invoiceNumber: "INV-2026-0089",
  vendorName: "Acme Corp",
  supplierNumber: "",
  amountDue: 5400,
  amountInvalid: false,
  projectNumber: "PRJ-992",
  projectName: "",
  lines: [
    { lineNum: "1", description: "Steel", quantity: 10, units: "ea", unitPrice: 540, amount: 5400 },
  ],
});

describe("invoice-validation", () => {
  it("loads its rulebook from knowledge/validationRules.json", async () => {
    assert.equal(validationRules.version, "1.0");
    assert.equal(validationRules.status.onValidationPass, "Matched");
    assert.equal(validationRules.status.onValidationFail, "Exception");
    assert.equal(validationRules.invoiceType.default, "Standard");
    const onDisk = JSON.parse(
      await readFile(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "..",
          "knowledge",
          "validationRules.json",
        ),
        "utf8",
      ),
    );
    assert.deepEqual(validationRules, onDisk);
    assert.equal(validationRules.checks.length, 7);
  });

  it("defaults to Standard and uses Credit memo for negative totals", () => {
    assert.equal(classifyInvoiceType(5400), INVOICE_TYPE_STANDARD);
    assert.equal(classifyInvoiceType(0), INVOICE_TYPE_STANDARD);
    assert.equal(classifyInvoiceType(-250.5), INVOICE_TYPE_CREDIT_MEMO);
    assert.equal(classifyInvoiceType("not a number"), INVOICE_TYPE_STANDARD);
  });

  it("marks fully valid drafts as Matched with no exceptions", () => {
    const result = validateInvoiceDraft(validDraft(), masters);
    assert.equal(result.status, STATUS_MATCHED);
    assert.equal(result.exceptionCount, 0);
    assert.deepEqual(result.messages, []);
    assert.equal(result.invoiceType, INVOICE_TYPE_STANDARD);
    assert.equal(result.supplierId, 11);
    assert.equal(result.projectId, null);
  });

  it("marks credit memos as Matched when everything else validates", () => {
    const result = validateInvoiceDraft(
      {
        ...validDraft(),
        invoiceNumber: "CM-77",
        amountDue: -250.5,
        lines: [{ lineNum: "1", description: "Return", quantity: 1, units: "ea", unitPrice: -250.5, amount: -250.5 }],
      },
      masters,
    );
    assert.equal(result.status, STATUS_MATCHED);
    assert.equal(result.invoiceType, INVOICE_TYPE_CREDIT_MEMO);
    assert.deepEqual(result.messages, []);
  });

  it("flags a blank invoice number as an exception", () => {
    const result = validateInvoiceDraft({ ...validDraft(), invoiceNumber: "  " }, masters);
    assert.equal(result.status, STATUS_EXCEPTION);
    assert.ok(result.messages.some((message) => message.includes("Invoice number is blank")));
  });

  it("flags a blank supplier as an exception", () => {
    const result = validateInvoiceDraft({ ...validDraft(), vendorName: "" }, masters);
    assert.equal(result.status, STATUS_EXCEPTION);
    assert.ok(result.messages.some((message) => message.includes("Supplier is blank")));
  });

  it("flags a non-numeric amount as an exception", () => {
    const result = validateInvoiceDraft(
      { ...validDraft(), amountDue: 0, amountInvalid: true },
      masters,
    );
    assert.equal(result.status, STATUS_EXCEPTION);
    assert.ok(result.messages.some((message) => message.includes("Amount due")));
  });

  it("does not match suppliers by number alone", () => {
    const result = validateInvoiceDraft(
      { ...validDraft(), vendorName: "SUP-1024" },
      masters,
    );
    assert.equal(result.status, STATUS_EXCEPTION);
    assert.ok(result.messages.some((message) => message.includes("SUP-1024")));
  });

  it("flags a supplier that matches neither name nor number", () => {
    const result = validateInvoiceDraft({ ...validDraft(), vendorName: "Ghost Ltd" }, masters);
    assert.equal(result.status, STATUS_EXCEPTION);
    assert.ok(result.messages.some((message) => message.includes("Ghost Ltd")));
  });

  it("ignores project values: unknown or blank projects still validate", () => {
    const unknown = validateInvoiceDraft(
      { ...validDraft(), projectNumber: "PRJ-999", projectName: "" },
      masters,
    );
    assert.equal(unknown.status, STATUS_MATCHED);
    assert.deepEqual(unknown.messages, []);

    const blank = validateInvoiceDraft(
      { ...validDraft(), projectNumber: "", projectName: "" },
      masters,
    );
    assert.equal(blank.status, STATUS_MATCHED);
    assert.deepEqual(blank.messages, []);
  });

  it("flags header and lines totals that do not reconcile", () => {
    const result = validateInvoiceDraft(
      {
        ...validDraft(),
        amountDue: 5400,
        lines: [{ lineNum: "1", description: "Steel", quantity: 10, units: "ea", unitPrice: 100, amount: 1000 }],
      },
      masters,
    );
    assert.equal(result.status, STATUS_EXCEPTION);
    assert.ok(result.messages.some((message) => message.includes("does not match the lines total")));
  });

  it("fails a repeated invoice number for the same supplier as a duplicate", () => {
    const withPending = {
      ...masters,
      invoices: [
        { headerId: 5, invoiceNumber: "INV-2026-0089", supplierId: 11, vendorName: "Acme Corp", status: "Matched" },
      ],
    };
    const result = validateInvoiceDraft(validDraft(), withPending);
    assert.equal(result.status, STATUS_EXCEPTION);
    assert.ok(result.messages.some((message) => message.toLowerCase().includes("duplicate")));
  });

  it("passes the same invoice number when the earlier invoice is Ready or Approved", () => {
    for (const status of ["Ready", "Approved"]) {
      const result = validateInvoiceDraft(validDraft(), {
        ...masters,
        invoices: [
          { headerId: 5, invoiceNumber: "INV-2026-0089", supplierId: 11, vendorName: "Acme Corp", status },
        ],
      });
      assert.equal(result.status, STATUS_MATCHED, `status ${status} should not block`);
      assert.deepEqual(result.messages, []);
    }
  });

  it("ignores other suppliers and the invoice itself in the duplicate check", () => {
    const otherSupplier = validateInvoiceDraft(validDraft(), {
      ...masters,
      invoices: [
        { headerId: 6, invoiceNumber: "INV-2026-0089", supplierId: 12, vendorName: "Northgate Steelworks", status: "Matched" },
      ],
    });
    assert.equal(otherSupplier.status, STATUS_MATCHED);

    const selfOnly = validateInvoiceDraft(
      validDraft(),
      {
        ...masters,
        invoices: [
          { headerId: 9, invoiceNumber: "INV-2026-0089", supplierId: 11, vendorName: "Acme Corp", status: "Matched" },
        ],
      },
      { excludeHeaderId: 9 },
    );
    assert.equal(selfOnly.status, STATUS_MATCHED);
  });

  it("collects one message per failed check and counts them", () => {
    const result = validateInvoiceDraft(
      { ...validDraft(), invoiceNumber: "", vendorName: "", projectNumber: "", projectName: "", amountDue: 0, amountInvalid: true },
      masters,
    );
    assert.equal(result.status, STATUS_EXCEPTION);
    assert.equal(result.exceptionCount, result.messages.length);
    assert.ok(result.messages.length >= 3);
  });
});
