import assert from "node:assert/strict";
import test from "node:test";

import { updateLiveInvoice, validateUpdateFields } from "../server/invoice-update.mjs";

const HEADER_COLS = ["HEADER_ID", "INVOICE_NUMBER", "SUPPLIER_NAME", "VENDOR_NAME", "JOB_NUMBER",
  "INVOICE_SOURCE", "RECEIVED_DATE", "INVOICE_DATE", "AMOUNT_DUE", "INVOICE_CURRENCY",
  "PROCESSING_STATUS", "REMITTANCE_ADDRESS", "CUSTOMER_ADDRESS", "EXCEPTION_COUNT",
  "PAYABLES_REVIEW_CONFIRMED"];
const LINE_COLS = ["LINE_ID", "HEADER_ID", "LINE_NUM", "NAME", "PRODUCT_CODE", "DESCRIPTION",
  "QUANTITY", "UNITS", "UNIT_PRICE", "AMOUNT", "CREATION_DATE", "CREATED_BY"];
const ACTION_COLS = ["ACTION_ID", "HEADER_ID", "ACTION_TYPE", "ACTION_BY",
  "OLD_STATUS", "NEW_STATUS", "REMARKS", "CHANGE_TEXT", "CREATION_DATE", "CREATED_BY"];
const NOTE_COLS = ["NOTIFICATION_ID", "HEADER_ID", "NOTIFICATION_TYPE", "RECIPIENT_ROLE",
  "SUBJECT", "REMARKS", "IS_READ", "DELIVERY_CHANNEL", "DELIVERY_STATUS",
  "CREATION_DATE", "CREATED_BY"];

const HEADER_ROW = {
  HEADER_ID: 7,
  INVOICE_NUMBER: "INV-7",
  SUPPLIER_NAME: "Acme",
  VENDOR_NAME: "Acme",
  JOB_NUMBER: "JOB-1",
  INVOICE_SOURCE: "Gmail",
  RECEIVED_DATE: new Date("2026-10-26T00:00:00Z"),
  INVOICE_DATE: new Date("2026-10-24T00:00:00Z"),
  AMOUNT_DUE: 300,
  INVOICE_CURRENCY: "USD",
  PROCESSING_STATUS: "Matched",
  REMITTANCE_ADDRESS: "Remit 1",
  BILL_TO: "Bill 1",
  EXCEPTION_COUNT: 0,
  PAYABLES_REVIEW_CONFIRMED: "N",
};

const LINE_ROWS = [
  { DESCRIPTION: "Concrete", QUANTITY: 2, UNITS: "m3", UNIT_PRICE: 100, AMOUNT: 200 },
  { DESCRIPTION: "Pump", QUANTITY: 1, UNITS: "ea", UNIT_PRICE: 100, AMOUNT: 100 },
];

function stubConnection({ headerRow = HEADER_ROW, lineRows = LINE_ROWS, failAuditOnce = false } = {}) {
  const seen = [];
  let nextId = 900;
  let auditFailed = false;
  return {
    seen,
    execute: async (sql, binds) => {
      seen.push({ sql, binds });
      // Strict like the Oracle driver: every placeholder occurrence needs a value.
      const occurrences = (String(sql).match(/:\d+/g) || []).length;
      const values = Array.isArray(binds) ? binds.length : 0;
      if (occurrences !== values) {
        throw new Error(
          `NJS-098: ${occurrences} bind placeholders were used in the SQL statement but ${values} bind values were provided`,
        );
      }
      if (sql.includes("user_tab_columns")) {
        const cols = {
          INVOICE_LINES: LINE_COLS,
          INVOICE_REVIEW_ACTION: ACTION_COLS,
          NOTIFICATION: NOTE_COLS,
        };
        return { rows: (cols[binds[0]] || []).map((COLUMN_NAME) => ({ COLUMN_NAME })) };
      }
      if (sql.includes("NVL(MAX")) return { rows: [{ NEXT_ID: ++nextId }] };
      if (sql.includes("NEXTVAL")) return { rows: [{ NEXT_ID: ++nextId }] };
      if (sql.includes("FROM invoice_header WHERE header_id")) return { rows: [headerRow] };
      if (sql.includes("FROM invoice_lines WHERE header_id")) return { rows: lineRows };
      if (sql.startsWith("UPDATE invoice_header")) {
        if (failAuditOnce && !auditFailed && sql.includes("updated_date")) {
          auditFailed = true;
          throw new Error("ORA-00904: \"UPDATED_DATE\": invalid identifier");
        }
        return { rowsAffected: 1 };
      }
      if (sql.startsWith("INSERT INTO")) {
        const out = {};
        out[binds.length] = [++nextId];
        return { outBinds: out };
      }
      return { rowsAffected: 1 };
    },
    commit: async () => {},
    rollback: async () => {},
    close: async () => {},
  };
}

const FIELDS = {
  jobNumber: "JOB-2",
  source: "Manual Upload",
  receivedDate: "2026-10-27",
  invoiceDate: "2026-10-25",
  amount: 350,
  currency: "EUR",
  remittanceAddress: "Remit 2",
  billToAddress: "Bill 2",
  exceptionCount: 1,
  payablesReviewConfirmed: false,
  lines: [
    { description: "Concrete", quantity: 2, units: "m3", unitPrice: 125, amount: 250 },
    { description: "Pump", quantity: 1, units: "ea", unitPrice: 100, amount: 100 },
  ],
};

test("validateUpdateFields rejects bad amounts and lines", () => {
  assert.deepEqual(validateUpdateFields({ amount: 10 }), []);
  assert.match(validateUpdateFields({ amount: "abc" }).join(" "), /Header amount/);
  assert.match(validateUpdateFields({ exceptionCount: -1 }).join(" "), /Exception count/);
  assert.match(
    validateUpdateFields({ lines: [{ description: " ", quantity: 1, amount: 5 }] }).join(" "),
    /description is required/,
  );
});

test("live edit updates the header, replaces lines, logs and notifies", async () => {
  const connection = stubConnection();
  const result = await updateLiveInvoice(connection, 7, FIELDS, {
    remarks: "Corrected the job and totals.",
    actionBy: "editor",
  });
  assert.equal(result.headerId, 7);
  assert.equal(result.oldStatus, "Matched");
  assert.equal(result.newStatus, "Matched");
  assert.ok(result.changes.some((change) => change.includes("Job number: JOB-1 → JOB-2")));
  assert.ok(result.changes.some((change) => change.startsWith("Lines updated:")));

  const update = connection.seen.find((s) => s.sql.startsWith("UPDATE invoice_header"));
  assert.ok(update);
  assert.ok(update.binds.includes("JOB-2"));

  const del = connection.seen.find((s) => s.sql.startsWith("DELETE FROM invoice_lines"));
  assert.ok(del);
  const lineInserts = connection.seen.filter((s) => s.sql.startsWith("INSERT INTO INVOICE_LINES"));
  assert.equal(lineInserts.length, 2);

  const action = connection.seen.find((s) => s.sql.startsWith("INSERT INTO INVOICE_REVIEW_ACTION"));
  assert.ok(action.binds.includes("EDIT"));
  assert.ok(action.binds.includes("Corrected the job and totals."));

  const note = connection.seen.find((s) => s.sql.startsWith("INSERT INTO NOTIFICATION"));
  assert.ok(note.binds.includes("INVOICE_UPDATED"));
  assert.ok(note.binds.includes("Payables Manager"));
});

test("live edit requires remarks and refuses final headers", async () => {
  await assert.rejects(
    updateLiveInvoice(stubConnection(), 7, FIELDS, { remarks: "  " }),
    /remarks/i,
  );
  await assert.rejects(
    updateLiveInvoice(
      stubConnection({ headerRow: { ...HEADER_ROW, PROCESSING_STATUS: "Approved" } }),
      7,
      FIELDS,
      { remarks: "ok" },
    ),
    /already Approved/,
  );
  await assert.rejects(
    updateLiveInvoice(stubConnection(), 7, { amount: "nope" }, { remarks: "ok" }),
    /Header amount/,
  );
  await assert.rejects(
    updateLiveInvoice(stubConnection(), Number.NaN, FIELDS, { remarks: "ok" }),
    /headerId must be an integer/,
  );
});

test("live edit allows status moves between non-final statuses", async () => {
  const connection = stubConnection();
  const result = await updateLiveInvoice(
    connection,
    7,
    { status: "Ready" },
    { remarks: "Verified, moving to ready." },
  );
  assert.equal(result.oldStatus, "Matched");
  assert.equal(result.newStatus, "Ready");
  assert.ok(result.changes.some((change) => change.includes("Processing status: Matched → Ready")));
  const update = connection.seen.find((s) => s.sql.startsWith("UPDATE invoice_header"));
  assert.ok(update.binds.includes("Ready"));
});

test("live edit skips the lines rewrite when lines are unchanged", async () => {
  const connection = stubConnection();
  const result = await updateLiveInvoice(
    connection,
    7,
    {
      jobNumber: "JOB-2",
      lines: [
        { description: "Concrete", quantity: 2, units: "m3", unitPrice: 100, amount: 200 },
        { description: "Pump", quantity: 1, units: "ea", unitPrice: 100, amount: 100 },
      ],
    },
    { remarks: "Header-only tweak." },
  );
  assert.equal(result.headerId, 7);
  assert.ok(!connection.seen.some((s) => s.sql.startsWith("DELETE FROM invoice_lines")));
  assert.ok(!connection.seen.some((s) => s.sql.startsWith("INSERT INTO INVOICE_LINES")));
  assert.ok(result.changes.some((change) => change.includes("Job number")));
  assert.ok(!result.changes.some((change) => change.startsWith("Lines updated:")));
});

test("live edit refuses Approved/Rejected and unknown statuses", async () => {
  await assert.rejects(
    updateLiveInvoice(stubConnection(), 7, { status: "Approved" }, { remarks: "ok" }),
    /approve\/reject decision/,
  );
  await assert.rejects(
    updateLiveInvoice(stubConnection(), 7, { status: "Rejected" }, { remarks: "ok" }),
    /approve\/reject decision/,
  );
  await assert.rejects(
    updateLiveInvoice(stubConnection(), 7, { status: "Archived" }, { remarks: "ok" }),
    /not editable/,
  );
});

test("live edit locks the header row and allocates line ids from the sequence", async () => {
  const connection = stubConnection();
  await updateLiveInvoice(connection, 7, FIELDS, {
    remarks: "ok",
    actionBy: "editor",
  });
  const lock = connection.seen.find((s) => s.sql.includes("FROM invoice_header WHERE header_id"));
  assert.ok(lock);
  assert.match(lock.sql, /FOR UPDATE/);
  const seq = connection.seen.filter((s) => String(s.sql).includes("inv_line_seq.NEXTVAL"));
  assert.equal(seq.length, 2);
});

test("live edit falls back to MAX+1 line ids when the sequence is missing", async () => {
  const connection = stubConnection();
  const origExecute = connection.execute.bind(connection);
  connection.execute = async (sql, binds, opts) => {
    if (String(sql).includes("NEXTVAL")) throw new Error("ORA-02289: sequence does not exist");
    return origExecute(sql, binds, opts);
  };
  const result = await updateLiveInvoice(connection, 7, FIELDS, { remarks: "ok" });
  assert.equal(result.headerId, 7);
  assert.ok(connection.seen.some((s) => String(s.sql).includes("NVL(MAX")));
  const lineInserts = connection.seen.filter((s) => s.sql.startsWith("INSERT INTO INVOICE_LINES"));
  assert.equal(lineInserts.length, 2);
});

test("live edit retries without audit columns on older tables", async () => {
  const connection = stubConnection({ failAuditOnce: true });
  const result = await updateLiveInvoice(connection, 7, { jobNumber: "JOB-9" }, { remarks: "ok" });
  assert.equal(result.headerId, 7);
  const updates = connection.seen.filter((s) => s.sql.startsWith("UPDATE invoice_header"));
  assert.equal(updates.length, 2);
  assert.doesNotMatch(updates[1].sql, /updated_date/);
});
