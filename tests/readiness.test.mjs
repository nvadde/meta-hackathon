import assert from "node:assert/strict";
import test from "node:test";

import { markReadyInvoices } from "../server/readiness.mjs";

function stubConnection() {
  const seen = [];
  return {
    seen,
    execute: async (sql, binds) => {
      seen.push({ sql, binds });
      if (sql.startsWith("SELECT h.header_id")) {
        return {
          rows: [
            { HEADER_ID: 1, INVOICE_NUMBER: "INV-1", SUPPLIER_NAME: "Known Supplier", VENDOR_NAME: null, PROJECT_NUMBER: "PRJ-1", AMOUNT_DUE: 100, EXCEPTION_COUNT: 0, PROCESSING_STATUS: "Received" },
            { HEADER_ID: 2, INVOICE_NUMBER: "INV-2", SUPPLIER_NAME: "Known Supplier", VENDOR_NAME: null, PROJECT_NUMBER: "PRJ-1", AMOUNT_DUE: 100, EXCEPTION_COUNT: 1, PROCESSING_STATUS: "Received" },
            { HEADER_ID: 3, INVOICE_NUMBER: "INV-3", SUPPLIER_NAME: "Unknown Supplier", VENDOR_NAME: null, PROJECT_NUMBER: "PRJ-1", AMOUNT_DUE: 100, EXCEPTION_COUNT: 0, PROCESSING_STATUS: "Received" },
            { HEADER_ID: 4, INVOICE_NUMBER: "INV-4", SUPPLIER_NAME: "Known Supplier", VENDOR_NAME: null, PROJECT_NUMBER: "PRJ-9", AMOUNT_DUE: 100, EXCEPTION_COUNT: 0, PROCESSING_STATUS: "Received" },
            { HEADER_ID: 5, INVOICE_NUMBER: "INV-5", SUPPLIER_NAME: "Known Supplier", VENDOR_NAME: null, PROJECT_NUMBER: "PRJ-1", AMOUNT_DUE: 100, EXCEPTION_COUNT: 0, PROCESSING_STATUS: "Received" },
          ],
        };
      }
      if (sql.includes("FROM supplier_master")) {
        return { rows: [{ SUPPLIER_NAME: "Known Supplier", STATUS: "Active" }] };
      }
      if (sql.includes("FROM project_master")) {
        return { rows: [{ PROJECT_NUMBER: "PRJ-1", STATUS: "Active" }] };
      }
      if (sql.includes("FROM invoice_lines")) {
        return {
          rows: [
            { HEADER_ID: 1, LINE_TOTAL: 100 },
            { HEADER_ID: 5, LINE_TOTAL: 90 },
          ],
        };
      }
      if (sql.includes("user_tab_columns")) {
        const cols = {
          INVOICE_HEADER: ["HEADER_ID", "PROCESSING_STATUS"],
          INVOICE_REVIEW_ACTION: ["ACTION_ID", "HEADER_ID", "ACTION_TYPE", "ACTION_BY",
            "OLD_STATUS", "NEW_STATUS", "REMARKS", "CHANGE_TEXT", "CREATION_DATE", "CREATED_BY"],
        };
        return { rows: (cols[binds[0]] || []).map((COLUMN_NAME) => ({ COLUMN_NAME })) };
      }
      if (sql.includes("NVL(MAX")) return { rows: [{ NEXT_ID: 900 }] };
      return { rowsAffected: 1 };
    },
  };
}

test("markReadyInvoices promotes only fully qualifying headers", async () => {
  const connection = stubConnection();
  const result = await markReadyInvoices(connection, { createdBy: "SIRE" });
  assert.deepEqual(result.marked.map((m) => m.headerId), [1]);
  const updates = connection.seen.filter((s) => s.sql.startsWith("UPDATE invoice_header"));
  assert.equal(updates.length, 1);
  assert.ok(updates[0].sql.includes("'Ready'"));
  const action = connection.seen.find((s) => s.sql.startsWith("INSERT INTO INVOICE_REVIEW_ACTION"));
  assert.ok(action);
  assert.ok(action.binds.includes("EDIT"));
});
