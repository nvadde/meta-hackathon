import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  entryAbsolutePath,
  insertManualFromConversion,
  insertManualInvoice,
  insertReceivedInvoice,
  isPdfBuffer,
  nextFileId,
  storedFileNameFor,
} from "../invoiceSource/Manual/manual-upload.mjs";

test("manual upload only accepts real PDF content", () => {
  assert.equal(isPdfBuffer(Buffer.from("%PDF-1.7\nrest of file")), true);
  assert.equal(isPdfBuffer(Buffer.from("PK\x03\x04 zip content")), false);
  assert.equal(isPdfBuffer(Buffer.from("")), false);
  assert.equal(isPdfBuffer(Buffer.from("%PD")), false);
});

test("manual upload stored file names are safe and unique-looking", () => {
  const name = storedFileNameFor("../../My Invoice (final).PDF", 12345);
  assert.match(name, /^manual-12345-[a-z0-9-]+\.pdf$/);
  assert.ok(!name.includes(".."));
  assert.ok(!name.includes("/"));
  assert.ok(!name.includes("\\"));
});

test("nextFileId is one more than the largest registered file_id", () => {
  assert.equal(nextFileId([]), 1);
  assert.equal(nextFileId([{ file_id: 3 }, { file_id: 16 }, { file_id: 9 }]), 17);
});

test("entryAbsolutePath resolves bundled and ephemeral entries", () => {
  assert.equal(
    entryAbsolutePath({ file_path: "files/Manual/manual-1-a.pdf" }, { rootDir: "/root", tmpRoot: "/tmp" }),
    path.join(path.resolve("/root"), "files", "Manual", "manual-1-a.pdf"),
  );
  assert.equal(
    entryAbsolutePath({ file_path: "tmp/invoices/tmp-1-a.pdf" }, { rootDir: "/root", tmpRoot: "/tmp" }),
    path.join("/tmp", "invoices", "tmp-1-a.pdf"),
  );
});

function stubConnection() {
  const seen = [];
  let nextId = 500;
  const connection = {
    seen,
    execute: async (sql, binds) => {
      seen.push({ sql, binds });
      if (sql.includes("user_tab_columns")) {
        const tableCols = {
          FILE_DETAILS: ["FILE_ID", "FILE_NAME", "ORIGINAL_FILE_NAME", "FILE_PATH", "FILE_SIZE_BYTES",
            "MIME_TYPE", "SOURCE_CHANNEL", "MESSAGE_ID", "STATUS", "CREATION_DATE", "CREATED_BY"],
          INVOICE_HEADER: ["HEADER_ID", "FILE_ID", "INVOICE_NUMBER", "VENDOR_NAME", "SUPPLIER_NAME",
            "INVOICE_DATE", "RECEIVED_DATE", "AMOUNT_DUE", "INVOICE_CURRENCY",
            "INVOICE_SOURCE", "PROCESSING_STATUS", "EXCEPTION_COUNT",
            "PROJECT_NUMBER", "JOB_NUMBER",
            "CUSTOMER_ADDRESS", "REMITTANCE_ADDRESS", "CREATION_DATE", "CREATED_BY"],
          INVOICE_LINES: ["LINE_ID", "HEADER_ID", "LINE_NUM", "NAME", "DESCRIPTION",
            "QUANTITY", "UNITS", "UNIT_PRICE", "AMOUNT"],
        };
        return { rows: (tableCols[binds[0]] || []).map((COLUMN_NAME) => ({ COLUMN_NAME })) };
      }
      if (sql.includes("NVL(MAX")) return { rows: [{ NEXT_ID: ++nextId }] };
      if (sql.includes("FROM file_details WHERE file_id")) return { rows: [{ FILE_ID: 42 }] };
      if (sql.includes("FROM supplier_master")) {
        return { rows: [{ SUPPLIER_ID: 11, SUPPLIER_NUMBER: "SUP-T1", SUPPLIER_NAME: "Test Supplier" }] };
      }
      if (sql.includes("FROM project_master")) {
        return { rows: [{ PROJECT_ID: 22, PROJECT_NUMBER: "PRJ-1", PROJECT_NAME: "Test Project" }] };
      }
      return { rowsAffected: 1 };
    },
  };
  return connection;
}

function auditStub() {
  const files = new Map();
  return {
    files,
    fs: {
      mkdir: async () => {},
      writeFile: async (filePath, data) => void files.set(filePath, data),
    },
    root: "/tmp/sire-audit",
  };
}

const manualFields = {
  invoiceNumber: "INV-9001",
  supplier: "Test Supplier",
  project: "Test Project",
  projectNumber: "PRJ-1",
  jobNumber: "JOB-1",
  invoiceDate: "2026-10-20",
  receivedDate: "2026-10-21",
  currency: "USD",
  amount: 100,
  remittanceAddress: "Remit",
  billToAddress: "Bill",
  lineDescription: "Widgets",
  lineQuantity: 2,
  lineUnits: "ea",
  lineAmount: 100,
};

test("insertManualInvoice writes file_details, header and one line", async () => {
  const connection = stubConnection();
  const audit = auditStub();
  const result = await insertManualInvoice(
    connection,
    { file_id: 42, file_name: "manual-1-a.pdf", file_path: "files/Manual/manual-1-a.pdf" },
    { ...manualFields, fileSizeBytes: 1234 },
    { auditFs: audit.fs, auditRoot: audit.root },
  );
  assert.equal(result.status, "imported");
  assert.match(result.auditFile, /^Manual\/manual-1-a-\d{4}-\d{2}-\d{2}T.*\.json$/);
  assert.equal(audit.files.size, 1);
  assert.equal(JSON.parse([...audit.files.values()][0]).processingStatus, "Matched");
  assert.equal(result.processingStatus, "Matched");
  assert.equal(result.invoiceType, "Standard");
  assert.deepEqual(result.exceptionMessages, []);
  const inserts = connection.seen.filter((s) => s.sql.startsWith("INSERT INTO"));
  assert.deepEqual(
    inserts.map((s) => s.sql.match(/INSERT INTO (\w+)/)[1]),
    ["FILE_DETAILS", "INVOICE_HEADER", "INVOICE_LINES"],
  );
  const header = connection.seen.find((s) => s.sql.startsWith("INSERT INTO INVOICE_HEADER"));
  assert.ok(header.binds.includes("INV-9001"));
  assert.ok(header.binds.includes("Manual Upload"));
  const line = connection.seen.find((s) => s.sql.startsWith("INSERT INTO INVOICE_LINES"));
  assert.ok(line.binds.includes("Widgets"));
});

const EXTRACT_JSON = JSON.stringify({
  InvoiceId: "INV-9001",
  VendorName: "Model Vendor",
  InvoiceDate: "2026-10-20",
  AmountDue: 100,
  Currency: "USD",
  ProjectNumber: "PRJ-9",
  "lineitem.Items": [
    { "lineitem.LineNum": 1, "lineitem.Description": "Model line", "lineitem.Quantity": 2, "lineitem.Amount": 100 },
  ],
});

test("insertManualFromConversion llama mode fills blanks then inserts", async () => {
  const connection = stubConnection();
  const audit = auditStub();
  const result = await insertManualFromConversion(
    connection,
    { file_id: 44, file_name: "manual-1.pdf", file_path: "files/Manual/manual-1.pdf" },
    {
      mode: "llama",
      userFields: { ...manualFields, projectNumber: "", remittanceAddress: "" },
      fileSizeBytes: 10,
      schemaText: "{}",
      stagedBytes: Buffer.from("%PDF-"),
      convertFn: async () => EXTRACT_JSON,
      auditFs: audit.fs,
      auditRoot: audit.root,
    },
  );
  assert.equal(result.stored.status, "imported");
  assert.equal(result.extracted, true);
  assert.ok(result.filledKeys.includes("projectNumber"));
  const header = connection.seen.find((s) => s.sql.startsWith("INSERT INTO INVOICE_HEADER"));
  assert.ok(header.binds.includes("PRJ-9"));
});

test("insertManualFromConversion react mode validates then inserts", async () => {
  const connection = stubConnection();
  const audit = auditStub();
  const result = await insertManualFromConversion(
    connection,
    { file_id: 45, file_name: "manual-2.pdf", file_path: "files/Manual/manual-2.pdf" },
    {
      mode: "react",
      userFields: { ...manualFields, supplier: "", projectNumber: "" },
      fileSizeBytes: 10,
      schemaText: "[]",
      stagedBytes: Buffer.from("%PDF-"),
      modelFn: async () => EXTRACT_JSON,
      auditFs: audit.fs,
      auditRoot: audit.root,
    },
  );
  assert.equal(audit.files.size, 1);
  assert.match([...audit.files.keys()][0], /Manual[\\/]manual-2-\d{4}-\d{2}-\d{2}T.*\.json$/);
  assert.equal(result.stored.status, "imported");
  assert.equal(result.attempts, 1);
  assert.ok(result.filledKeys.includes("supplier"));
  const header = connection.seen.find((s) => s.sql.startsWith("INSERT INTO INVOICE_HEADER"));
  assert.ok(header.binds.includes("Model Vendor"));
});

test("insertManualFromConversion rejects unknown modes", async () => {
  await assert.rejects(
    insertManualFromConversion(stubConnection(), { file_id: 1, file_name: "m.pdf", file_path: "x" }, {
      mode: "other",
      userFields: manualFields,
      fileSizeBytes: 1,
      schemaText: "{}",
      stagedBytes: Buffer.from("%PDF-"),
    }),
    /llama.*react/,
  );
});

test("insertManualInvoice rejects invalid fields without touching the db", async () => {
  const connection = stubConnection();
  await assert.rejects(
    insertManualInvoice(
      connection,
      { file_id: 42, file_name: "m.pdf", file_path: "files/Manual/m.pdf" },
      { ...manualFields, invoiceNumber: "  ", amount: Number.NaN },
    ),
    /invoice number|header amount/i,
  );
  assert.equal(connection.seen.length, 0);
});

test("whatsapp channel inserts unknown suppliers as exceptions with messages", async () => {
  const connection = stubConnection();
  const audit = auditStub();
  const result = await insertReceivedInvoice(
    connection,
    { file_id: 43, file_name: "whatsapp-1-a.pdf", file_path: "files/Whatsapp/whatsapp-1-a.pdf" },
    { ...manualFields, invoiceNumber: "WA-001", supplier: "Unknown Vendor", lowConfidence: true },
    { channel: "WhatsApp", createdBy: "WHATSAPP_SYNC" },
    { auditFs: audit.fs, auditRoot: audit.root },
  );
  assert.match(result.auditFile, /^WhatsApp\/whatsapp-1-a-\d{4}-\d{2}-\d{2}T.*\.json$/);
  assert.equal(result.status, "imported");
  assert.equal(result.processingStatus, "Exception");
  assert.ok(result.exceptionMessages.some((message) => message.includes("Unknown Vendor")));
  const header = connection.seen.find((s) => s.sql.startsWith("INSERT INTO INVOICE_HEADER"));
  assert.ok(header.binds.includes("WhatsApp"));
  assert.ok(header.binds.includes("Exception"));
  assert.ok(header.binds.includes("WHATSAPP_SYNC"));
});
