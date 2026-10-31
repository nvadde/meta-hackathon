import assert from "node:assert/strict";
import test from "node:test";

import { claimForErp, getPublishedInvoices, writeBackErp } from "../server/erp-consumer.mjs";

function stubConnection({ publishedRows = [], claimWins = true, writeBackWins = true } = {}) {
  const seen = [];
  return {
    seen,
    execute: async (sql, binds) => {
      seen.push({ sql, binds });
      if (sql.includes("FROM invoice_header h")) return { rows: publishedRows };
      if (sql.startsWith("UPDATE erp_invoice_queue")) {
        if (sql.includes("SET queue_status = 'PROCESSING'")) return { rowsAffected: claimWins ? 1 : 0 };
        return { rowsAffected: writeBackWins ? 1 : 0 };
      }
      return { rows: [] };
    },
  };
}

test("getPublishedInvoices returns approved invoices with pickup state", async () => {
  const connection = stubConnection({
    publishedRows: [
      {
        HEADER_ID: 7,
        INVOICE_NUMBER: "INV-9",
        SUPPLIER_NAME: "Atlas Concrete Ltd",
        PROJECT_NUMBER: "PRJ-101",
        AMOUNT_DUE: 100,
        INVOICE_CURRENCY: "USD",
        PROCESSING_STATUS: "Approved",
        QUEUE_STATUS: "CREATED",
        ERP_INVOICE_ID: "ERP-4242",
        ERP_SYSTEM: "SIM",
        LAST_ERROR: null,
        PROCESSED_DATE: new Date("2026-10-30T00:00:00Z"),
      },
    ],
  });
  const rows = await getPublishedInvoices(connection);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].headerId, 7);
  assert.equal(rows[0].queueStatus, "CREATED");
  assert.equal(rows[0].erpInvoiceId, "ERP-4242");
  const select = connection.seen[0].sql;
  assert.match(select, /processing_status = 'Approved'/);
  assert.ok(!select.includes("Exception"));
});

test("claimForErp claims a QUEUED row; a second claim loses", async () => {
  const first = await claimForErp(stubConnection({ claimWins: true }), 7, { consumer: "SIM" });
  assert.equal(first.status, "claimed");
  assert.equal(first.queueStatus, "PROCESSING");
  await assert.rejects(claimForErp(stubConnection({ claimWins: false }), 7, {}), /first claim wins/i);
  await assert.rejects(claimForErp(stubConnection(), "x", {}), /headerId/i);
});

test("writeBackErp records CREATED with the ERP reference", async () => {
  const result = await writeBackErp(stubConnection(), 7, { outcome: "CREATED", erpInvoiceId: "ERP-4242" });
  assert.equal(result.status, "created");
  assert.equal(result.queueStatus, "CREATED");
});

test("writeBackErp records FAILED with the reason", async () => {
  const connection = stubConnection();
  const result = await writeBackErp(connection, 7, { outcome: "FAILED", reason: "Bad supplier site" });
  assert.equal(result.status, "failed");
  const update = connection.seen[0];
  assert.match(update.sql, /queue_status = :status/);
  assert.equal(update.binds.status, "FAILED");
  assert.equal(update.binds.reason, "Bad supplier site");
});

test("writeBackErp rejects bad outcomes, missing references, and unclaimed rows", async () => {
  await assert.rejects(writeBackErp(stubConnection(), 7, { outcome: "PENDING" }), /CREATED.*FAILED/);
  await assert.rejects(writeBackErp(stubConnection(), 7, { outcome: "CREATED" }), /erpInvoiceId/i);
  await assert.rejects(
    writeBackErp(stubConnection({ writeBackWins: false }), 7, { outcome: "FAILED", reason: "x" }),
    /claim it first/i,
  );
});
