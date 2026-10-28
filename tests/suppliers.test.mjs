import assert from "node:assert/strict";
import test from "node:test";

import { invoices } from "../src/data/invoices.ts";
import { supplierFeed } from "../src/data/suppliers.ts";
import { buildSupplierRows } from "../src/lib/suppliers.ts";

test("supplier rows carry ERP feed fields and count invoices per supplier", () => {
  const rows = buildSupplierRows(invoices, supplierFeed);
  assert.equal(rows.length, supplierFeed.length);
  for (const row of rows) {
    assert.ok(row.supplier);
    assert.ok(["Active", "Inactive"].includes(row.status));
    assert.ok(row.startDate);
    assert.ok(row.site);
    assert.ok(row.address);
    const expected = invoices.filter((invoice) => invoice.supplier === row.supplier).length;
    assert.equal(row.invoiceCount, expected, row.supplier);
  }
  const total = rows.reduce((sum, row) => sum + row.invoiceCount, 0);
  assert.equal(total, invoices.length);
});

test("suppliers found only on invoices are listed and marked as not in the ERP feed", () => {
  const extra = {
    ...invoices[0],
    id: "inv-extra",
    supplier: "Brand New Supplier Ltd",
  };
  const rows = buildSupplierRows([...invoices, extra], supplierFeed);
  const row = rows.find((item) => item.supplier === "Brand New Supplier Ltd");
  assert.ok(row, "invoice-only supplier must appear");
  assert.equal(row.invoiceCount, 1);
  assert.equal(row.inFeed, false);
  assert.match(row.site, /Not in ERP feed/);
});
