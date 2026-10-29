import assert from "node:assert/strict";
import test from "node:test";

import { recordReviewDecision } from "../server/review-decision.mjs";

function stubConnection({ headerRow, queueRows = [] } = {}) {
  const seen = [];
  let nextId = 800;
  return {
    seen,
    execute: async (sql, binds) => {
      seen.push({ sql, binds });
      if (sql.includes("user_tab_columns")) {
        const cols = {
          INVOICE_HEADER: ["HEADER_ID", "PROCESSING_STATUS", "INVOICE_NUMBER"],
          INVOICE_REVIEW_ACTION: ["ACTION_ID", "HEADER_ID", "ACTION_TYPE", "ACTION_BY",
            "OLD_STATUS", "NEW_STATUS", "REMARKS", "CHANGE_TEXT", "CREATION_DATE", "CREATED_BY"],
          NOTIFICATION: ["NOTIFICATION_ID", "HEADER_ID", "NOTIFICATION_TYPE", "RECIPIENT_ROLE",
            "SUBJECT", "REMARKS", "IS_READ", "DELIVERY_CHANNEL", "DELIVERY_STATUS",
            "CREATION_DATE", "CREATED_BY"],
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

test("approve updates the header, logs the action, notifies, and queues for ERP", async () => {
  const connection = stubConnection({
    headerRow: { HEADER_ID: 7, INVOICE_NUMBER: "INV-7", PROCESSING_STATUS: "Ready" },
  });
  const result = await recordReviewDecision(connection, {
    headerId: 7,
    decision: "approve",
    remarks: "Verified against the PDF.",
    actionBy: "payables.user",
  });
  assert.equal(result.oldStatus, "Ready");
  assert.equal(result.newStatus, "Approved");
  assert.equal(result.queued.status, "queued");
  const update = connection.seen.find((s) => s.sql.startsWith("UPDATE invoice_header"));
  assert.ok(update);
  const action = connection.seen.find((s) => s.sql.startsWith("INSERT INTO INVOICE_REVIEW_ACTION"));
  assert.ok(action.binds.includes("APPROVE"));
  assert.ok(action.binds.includes("Verified against the PDF."));
  const note = connection.seen.find((s) => s.sql.startsWith("INSERT INTO NOTIFICATION"));
  assert.ok(note.binds.includes("INVOICE_APPROVED"));
  assert.ok(note.binds.includes("Payables Manager"));
});

test("reject notifies without queuing for ERP", async () => {
  const connection = stubConnection({
    headerRow: { HEADER_ID: 8, INVOICE_NUMBER: "INV-8", PROCESSING_STATUS: "Exception" },
  });
  const result = await recordReviewDecision(connection, {
    headerId: 8,
    decision: "reject",
    remarks: "Wrong supplier.",
    actionBy: "",
  });
  assert.equal(result.newStatus, "Rejected");
  assert.equal(result.queued, null);
  const note = connection.seen.find((s) => s.sql.startsWith("INSERT INTO NOTIFICATION"));
  assert.ok(note.binds.includes("INVOICE_REJECTED"));
  assert.equal(connection.seen.filter((s) => s.sql.startsWith("INSERT INTO ERP_INVOICE_QUEUE")).length, 0);
});

test("review decisions require remarks and a decidable header", async () => {
  const header = { HEADER_ID: 9, INVOICE_NUMBER: "INV-9", PROCESSING_STATUS: "Ready" };
  await assert.rejects(
    recordReviewDecision(stubConnection({ headerRow: header }), { headerId: 9, decision: "approve", remarks: "  " }),
    /remarks/i,
  );
  await assert.rejects(
    recordReviewDecision(stubConnection({ headerRow: null }), { headerId: 9, decision: "approve", remarks: "ok" }),
    /no invoice_header row/i,
  );
  await assert.rejects(
    recordReviewDecision(
      stubConnection({ headerRow: { ...header, PROCESSING_STATUS: "Approved" } }),
      { headerId: 9, decision: "approve", remarks: "ok" },
    ),
    /already Approved/i,
  );
  await assert.rejects(
    recordReviewDecision(stubConnection({ headerRow: header }), { headerId: 9, decision: "maybe", remarks: "ok" }),
    /decision must be/i,
  );
});
