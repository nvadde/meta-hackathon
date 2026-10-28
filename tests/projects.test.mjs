import assert from "node:assert/strict";
import test from "node:test";

import { invoices } from "../src/data/invoices.ts";
import { projectFeed } from "../src/data/projects.ts";
import { buildProjectRows } from "../src/lib/projects.ts";

test("project rows carry ERP feed fields and count invoices per project", () => {
  const rows = buildProjectRows(invoices, projectFeed);
  assert.equal(rows.length, projectFeed.length);
  for (const row of rows) {
    assert.ok(row.project);
    assert.ok(row.projectNumber);
    assert.ok(["Active", "Inactive"].includes(row.status));
    assert.ok(row.startDate);
    assert.ok(row.address);
    const expected = invoices.filter((invoice) => invoice.project === row.project).length;
    assert.equal(row.invoiceCount, expected, row.project);
  }
  const total = rows.reduce((sum, row) => sum + row.invoiceCount, 0);
  assert.equal(total, invoices.length);
});

test("projects found only on invoices are listed and marked as not in the ERP feed", () => {
  const extra = {
    ...invoices[0],
    id: "inv-extra-project",
    project: "Depot Expansion",
    projectNumber: "PRJ-999",
  };
  const rows = buildProjectRows([...invoices, extra], projectFeed);
  const row = rows.find((item) => item.project === "Depot Expansion");
  assert.ok(row, "invoice-only project must appear");
  assert.equal(row.invoiceCount, 1);
  assert.equal(row.inFeed, false);
  assert.match(row.address, /Not in ERP feed|Site Office/);
});
