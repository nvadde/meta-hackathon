import assert from "node:assert/strict";
import test from "node:test";

import { enqueueForErp } from "../server/erp-queue.mjs";

function stubConnection({ headerRow, queueRows = [] } = {}) {
  const seen = [];
  let nextId = 700;
  return {
    seen,
    execute: async (sql, binds) => {
      seen.push({ sql, binds });
      if (sql.includes("user_tab_columns")) {
        const cols = {
          INVOICE_HEADER: ["HEADER_ID", "PROCESSING_STATUS"],
          ERP_INVOICE_QUEUE: ["QUEUE_ID", "HEADER_ID", "QUEUE_STATUS", "QUEUED_DATE",
            "ERP_SYSTEM", "ATTEMPT_COUNT", "CREATION_DATE", "CREATED_BY"],
        };
        return { rows: (cols[binds[0]] || []).map((COLUMN_NAME) => ({ COLUMN_NAME })) };
      }
      if (sql.includes("NVL(MAX")) return { rows: [{ NEXT_ID: ++nextId }] };
      if (sql.startsWith("SELECT header_id")) return { rows: headerRow ? [headerRow] : [] };
      if (sql.includes("FROM erp_invoice_queue")) return { rows: queueRows };
      return { rowsAffected: 1 };
    },
  };
}

test("enqueueForErp queues an approved header for ERP pickup", async () => {
  const connection = stubConnection({ headerRow: { HEADER_ID: 7, PROCESSING_STATUS: "Approved" } });
  const result = await enqueueForErp(connection, 7, { erpSystem: "Oracle Fusion", createdBy: "SIRE" });
  assert.equal(result.status, "queued");
  assert.equal(result.headerId, 7);
  const insert = connection.seen.find((s) => s.sql.startsWith("INSERT INTO ERP_INVOICE_QUEUE"));
  assert.ok(insert);
  assert.ok(insert.binds.includes(7));
  assert.ok(insert.binds.includes("QUEUED"));
  assert.ok(insert.binds.includes("Oracle Fusion"));
});

test("enqueueForErp reports an already-queued header without inserting", async () => {
  const connection = stubConnection({
    headerRow: { HEADER_ID: 7, PROCESSING_STATUS: "Approved" },
    queueRows: [{ QUEUE_ID: 701, QUEUE_STATUS: "QUEUED" }],
  });
  const result = await enqueueForErp(connection, 7, {});
  assert.equal(result.status, "already-queued");
  assert.equal(result.queueId, 701);
  assert.equal(connection.seen.filter((s) => s.sql.startsWith("INSERT INTO")).length, 0);
});

test("enqueueForErp refuses missing or unapproved headers", async () => {
  await assert.rejects(
    enqueueForErp(stubConnection({ headerRow: null }), 9, {}),
    /no invoice_header row/i,
  );
  await assert.rejects(
    enqueueForErp(stubConnection({ headerRow: { HEADER_ID: 9, PROCESSING_STATUS: "Received" } }), 9, {}),
    /only Ready or Approved/i,
  );
  await assert.rejects(enqueueForErp(stubConnection(), "x", {}), /headerId/i);
});

test("enqueueForErp queues a Ready header too", async () => {
  const connection = stubConnection({ headerRow: { HEADER_ID: 11, PROCESSING_STATUS: "Ready" } });
  const result = await enqueueForErp(connection, 11, {});
  assert.equal(result.status, "queued");
  assert.equal(result.headerId, 11);
});
