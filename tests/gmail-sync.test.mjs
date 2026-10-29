import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import oracledb from "oracledb";

import { importPdfBuffer, insertDraft, nextId, syncGmailInvoices } from "../invoiceSource/Gmail/gmail-sync.mjs";

describe("gmail-sync", () => {
  it("queries ids with the driver object outFormat constant", async () => {
    let seen;
    const connection = {
      execute: async (sql, binds, options) => {
        seen = { sql, binds, options };
        return { rows: [{ NEXT_ID: 7 }] };
      },
    };
    assert.equal(await nextId(connection, "FILE_DETAILS", "FILE_ID"), 7);
    assert.match(seen.sql, /FILE_DETAILS/);
    assert.deepEqual(seen.options, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  });

  it("imports each attachment independently when one fails", async () => {
    const moved = [];
    const message = {
      payload: {
        headers: [
          { name: "Subject", value: "Invoices" },
          { name: "From", value: "vendor@example.com" },
          { name: "Date", value: "2026-10-26" },
        ],
        parts: [
          { mimeType: "application/pdf", filename: "a1.pdf", body: { attachmentId: "a1" } },
          { mimeType: "application/pdf", filename: "a2.pdf", body: { attachmentId: "a2" } },
          { mimeType: "application/pdf", filename: "a3.pdf", body: { attachmentId: "a3" } },
          { mimeType: "application/pdf", filename: "a4.pdf", body: { attachmentId: "a4" } },
        ],
      },
    };
    const deps = {
      getAccessTokenFn: async () => "token",
      ensureLabelFn: async () => "L1",
      listMessagesFn: async () => ({ messages: [{ id: "m1" }] }),
      gmailFn: async () => message,
      getDbPoolFn: async () => ({
        getConnection: async () => ({
          execute: async () => ({ rows: [] }),
          commit: async () => {},
          rollback: async () => {},
          close: async () => {},
        }),
      }),
      markProcessedFn: async (id) => void moved.push(id),
      importAttachmentFn: async (_connection, _token, { attachment }) => {
        if (attachment.filename === "a2.pdf") throw new Error("ORA-00001: boom");
        return { status: "imported" };
      },
    };
    const summary = await syncGmailInvoices({ maxMessages: 5 }, deps);
    assert.equal(summary.checked, 1);
    assert.equal(summary.imported, 3);
    assert.equal(summary.skipped, 0);
    assert.deepEqual(summary.notes, []);
    assert.equal(summary.errors.length, 1);
    assert.match(summary.errors[0], /m1\/a2\.pdf/);
    assert.deepEqual(moved, ["m1"]);
  });

  it("stages a folder PDF, converts it, and inserts file/header/lines", async () => {
    const stagedName = "test-import-buffer.pdf";
    const writtenFiles = new Map();
    const fakeBuffer = Buffer.from("%PDF-1.4 fake");
    let nextIdValue = 40;
    const statements = [];
    const allColumns = (names) => ({ rows: names.map((COLUMN_NAME) => ({ COLUMN_NAME })) });
    const fullColumns = {
      FILE_DETAILS: ["FILE_ID", "FILE_NAME", "ORIGINAL_FILE_NAME", "FILE_PATH", "FILE_SIZE_BYTES", "MIME_TYPE", "SOURCE_CHANNEL", "MESSAGE_ID", "STATUS", "CREATION_DATE", "CREATED_BY"],
      INVOICE_HEADER: ["HEADER_ID", "FILE_ID", "INVOICE_NUMBER", "VENDOR_NAME", "SUPPLIER_NAME", "INVOICE_DATE", "RECEIVED_DATE", "AMOUNT_DUE", "INVOICE_CURRENCY", "INVOICE_SOURCE", "PROCESSING_STATUS", "EXCEPTION_COUNT", "PROJECT_NUMBER", "JOB_NUMBER", "BILLING_ADDRESS", "BILLING_ADDRESS_RECIPIENT", "CUSTOMER_ADDRESS", "CUSTOMER_ADDRESS_RECIPIENT", "REMITTANCE_ADDRESS", "REMITTANCE_ADDRESS_RECIPIENT", "SHIPPING_ADDRESS", "SHIPPING_ADDRESS_RECIPIENT", "SHIPPING_COST", "DUE_DATE", "PAYMENT_TERMS", "PREVIOUS_UNPAID_BALANCE", "TOTAL_TAX", "TOTAL_VAT", "VENDOR_ADDRESS", "CREATION_DATE", "CREATED_BY"],
      INVOICE_LINES: ["LINE_ID", "HEADER_ID", "LINE_NUM", "NAME", "PRODUCT_CODE", "DESCRIPTION", "QUANTITY", "UNITS", "UNIT_PRICE", "AMOUNT", "CREATION_DATE", "CREATED_BY"],
    };
    const connection = {
      execute: async (sql, binds) => {
        statements.push(sql);
        if (sql.includes("user_tab_columns")) return allColumns(fullColumns[binds[0]]);
        if (sql.includes("NVL(MAX")) return { rows: [{ NEXT_ID: ++nextIdValue }] };
        if (sql.includes("RETURNING FILE_ID")) return { outBinds: { 11: [41] } };
        if (sql.includes("FROM file_details WHERE file_id")) return { rows: [{ FILE_ID: 41 }] };
        if (sql.includes("RETURNING HEADER_ID")) return { outBinds: { 31: [7] } };
        if (sql.includes("INVOICE_LINES")) return { rowsAffected: 1 };
        throw new Error(`unexpected SQL: ${sql}`);
      },
    };
    const schemaJson = JSON.stringify({
      invoice_number: "INV-9",
      vendor_name: "Acme",
      invoice_date: "2026-10-26",
      amount_due: 200,
      currency: "USD",
      project_number: "",
      notes: "",
      lines: [
        { line_num: "1", description: "A", quantity: 1, units: "ea", unit_price: 150, amount: 150 },
        { line_num: "2", description: "B", quantity: 1, units: "ea", unit_price: 50, amount: 50 },
      ],
    });
    const result = await importPdfBuffer(
      connection,
      { buffer: fakeBuffer, originalName: stagedName, stagedName },
      {
        convertFn: async () => schemaJson,
        schemaTextFn: async () => "{}",
        stagingDir: "/tmp/sire-test",
        mkdirFn: async () => {},
        writeFileFn: async (filePath, data) => void writtenFiles.set(filePath, data),
        readFileFn: async (filePath) => {
          assert.ok(writtenFiles.has(filePath), "convert reads the staged file");
          return writtenFiles.get(filePath);
        },
      },
    );
    assert.equal(result.status, "imported");
    assert.equal(
      statements.filter((sql) => sql.startsWith("INSERT INTO INVOICE_LINES")).length,
      2,
    );
    const headerInsert = statements.find((sql) => sql.includes("INSERT INTO INVOICE_HEADER"));
    assert.ok(headerInsert);
    assert.match(headerInsert, /BILLING_ADDRESS/);
    assert.equal(writtenFiles.size, 1);
  });

  it("importPdfBuffer honors the ReAct engine toggle", async () => {
    const writtenFiles = new Map();
    const modelJson = JSON.stringify({
      InvoiceId: "844707",
      VendorName: "KATH FUEL OIL SERVICE CO",
      InvoiceDate: "2026-01-22",
      AmountDue: 200,
      Currency: "USD",
      Items: [
        { Description: "A", Quantity: 1, Unit: "ea", Amount: 200 },
      ],
    });
    let nextIdValue = 60;
    const statements = [];
    const allColumns = (names) => ({ rows: names.map((COLUMN_NAME) => ({ COLUMN_NAME })) });
    const fullColumns = {
      FILE_DETAILS: ["FILE_ID", "FILE_NAME", "ORIGINAL_FILE_NAME", "FILE_PATH", "FILE_SIZE_BYTES", "MIME_TYPE", "SOURCE_CHANNEL", "MESSAGE_ID", "STATUS", "CREATION_DATE", "CREATED_BY"],
      INVOICE_HEADER: ["HEADER_ID", "FILE_ID", "INVOICE_NUMBER", "VENDOR_NAME", "SUPPLIER_NAME", "INVOICE_DATE", "RECEIVED_DATE", "AMOUNT_DUE", "INVOICE_CURRENCY", "INVOICE_SOURCE", "PROCESSING_STATUS", "EXCEPTION_COUNT", "PROJECT_NUMBER", "JOB_NUMBER", "BILLING_ADDRESS", "BILLING_ADDRESS_RECIPIENT", "CUSTOMER_ADDRESS", "CUSTOMER_ADDRESS_RECIPIENT", "REMITTANCE_ADDRESS", "REMITTANCE_ADDRESS_RECIPIENT", "SHIPPING_ADDRESS", "SHIPPING_ADDRESS_RECIPIENT", "SHIPPING_COST", "DUE_DATE", "PAYMENT_TERMS", "PREVIOUS_UNPAID_BALANCE", "TOTAL_TAX", "TOTAL_VAT", "VENDOR_ADDRESS", "CREATION_DATE", "CREATED_BY"],
      INVOICE_LINES: ["LINE_ID", "HEADER_ID", "LINE_NUM", "NAME", "PRODUCT_CODE", "DESCRIPTION", "QUANTITY", "UNITS", "UNIT_PRICE", "AMOUNT", "CREATION_DATE", "CREATED_BY"],
    };
    const connection = {
      execute: async (sql, binds) => {
        statements.push({ sql, binds });
        if (sql.includes("user_tab_columns")) return allColumns(fullColumns[binds[0]]);
        if (sql.includes("NVL(MAX")) return { rows: [{ NEXT_ID: ++nextIdValue }] };
        if (sql.includes("FROM file_details WHERE file_id")) return { rows: [{ FILE_ID: 61 }] };
        return { rowsAffected: 1 };
      },
    };
    const result = await importPdfBuffer(
      connection,
      { buffer: Buffer.from("%PDF-1.4 fake"), originalName: "a.pdf", stagedName: "gmail-1-a.pdf", mode: "react" },
      {
        modelFn: async () => modelJson,
        convertFn: async () => {
          throw new Error("llama must not run in react mode");
        },
        schemaTextFn: async () => "{}",
        stagingDir: "/tmp/sire-test",
        mkdirFn: async () => {},
        writeFileFn: async (filePath, data) => void writtenFiles.set(filePath, data),
        readFileFn: async (filePath) => writtenFiles.get(filePath),
      },
    );
    assert.equal(result.status, "imported");
    assert.equal(result.engine, "react");
    const headerInsert = statements.find((entry) => entry.sql.includes("INSERT INTO INVOICE_HEADER"));
    assert.ok(headerInsert.binds.includes("844707"));
  });

  it("inserts the full muse.ai field set into header and lines", async () => {
    const { parseMuseInvoice } = await import("../invoiceSource/Gmail/gmail-ingest.mjs");
    const draft = parseMuseInvoice(
      {
        InvoiceId: "844708",
        InvoiceDate: "2026-01-22",
        DueDate: "2026-02-15",
        VendorName: "KATH FUEL OIL SERVICE CO",
        VendorAddress: "3096 RICE ST",
        BillingAddress: "BOX 1333",
        PaymentTerm: "15TH OF FOLLOWING MO",
        AmountDue: 2640.1,
        TotalTax: 203.62,
        "lineitem.Items": [
          {"lineitem.LineNum": 1, "lineitem.Name": "ULSD", "lineitem.ProductCode": "913", "lineitem.Quantity": 670.1, "lineitem.Amount": 2436.48},
        ],
      },
      {},
    );
    const seen = [];
    let nextIdValue = 100;
    const cols = (names) => ({ rows: names.map((COLUMN_NAME) => ({ COLUMN_NAME })) });
    const connection = {
      execute: async (sql, binds) => {
        seen.push({ sql, binds });
        if (sql.includes("user_tab_columns")) {
          const tableCols = {
            FILE_DETAILS: ["FILE_ID", "FILE_NAME", "ORIGINAL_FILE_NAME", "FILE_PATH", "FILE_SIZE_BYTES", "MIME_TYPE", "SOURCE_CHANNEL", "MESSAGE_ID", "STATUS", "CREATION_DATE", "CREATED_BY"],
            INVOICE_HEADER: ["HEADER_ID", "FILE_ID", "INVOICE_NUMBER", "VENDOR_NAME", "SUPPLIER_NAME", "INVOICE_DATE", "RECEIVED_DATE", "AMOUNT_DUE", "INVOICE_CURRENCY", "INVOICE_SOURCE", "PROCESSING_STATUS", "EXCEPTION_COUNT", "PROJECT_NUMBER", "JOB_NUMBER", "BILLING_ADDRESS", "BILLING_ADDRESS_RECIPIENT", "CUSTOMER_ADDRESS", "CUSTOMER_ADDRESS_RECIPIENT", "REMITTANCE_ADDRESS", "REMITTANCE_ADDRESS_RECIPIENT", "SHIPPING_ADDRESS", "SHIPPING_ADDRESS_RECIPIENT", "SHIPPING_COST", "DUE_DATE", "PAYMENT_TERMS", "PREVIOUS_UNPAID_BALANCE", "TOTAL_TAX", "TOTAL_VAT", "VENDOR_ADDRESS", "CREATION_DATE", "CREATED_BY"],
            INVOICE_LINES: ["LINE_ID", "HEADER_ID", "LINE_NUM", "NAME", "PRODUCT_CODE", "DESCRIPTION", "QUANTITY", "UNITS", "UNIT_PRICE", "AMOUNT", "CREATION_DATE", "CREATED_BY"],
          };
          return cols(tableCols[binds[0]]);
        }
        if (sql.includes("NVL(MAX")) return { rows: [{ NEXT_ID: ++nextIdValue }] };
        if (sql.includes("FROM file_details WHERE file_id")) return { rows: [{ FILE_ID: 101 }] };
        if (sql.includes("RETURNING FILE_ID")) return { outBinds: { 11: [101] } };
        if (sql.includes("RETURNING HEADER_ID")) return { outBinds: { 31: [7] } };
        return { rowsAffected: 1 };
      },
    };
    const stored = await insertDraft(
      connection,
      draft,
      {
        storedName: "inv.pdf",
        originalName: "inv.pdf",
        filePath: "files/invoices/inv.pdf",
        fileSizeBytes: 10,
        messageId: null,
        channel: "Manual Upload",
        createdBy: "FILE_SYNC",
        fallbackDescription: "844708",
      },
    );
    assert.equal(stored.status, "imported");
    assert.equal(stored.fileId, 101);
    assert.equal(stored.headerId, 7);
    assert.equal(stored.lineCount, 1);
    const header = seen.find((s) => s.sql.includes("INSERT INTO INVOICE_HEADER"));
    assert.match(header.sql, /BILLING_ADDRESS/);
    assert.match(header.sql, /PAYMENT_TERMS/);
    assert.ok(header.binds.includes("FILE_SYNC"));
    assert.ok(header.binds.includes("Manual Upload"));
    assert.equal(header.binds[2], "844708");
    assert.equal(header.binds[14], "BOX 1333");
    assert.equal(header.binds[24], "15TH OF FOLLOWING MO");
    const line = seen.find((s) => s.sql.includes("INSERT INTO INVOICE_LINES"));
    assert.match(line.sql, /PRODUCT_CODE/);
    assert.equal(line.binds[4], "913");
    assert.equal(line.binds[6], 670.1);
    assert.equal(line.binds[9], 2436.48);
  });

  it("drops columns the table does not have instead of failing", async () => {
    const { insertAdaptive } = await import("../invoiceSource/Gmail/gmail-sync.mjs");
    const seen = [];
    const connection = {
      execute: async (sql, binds) => {
        seen.push({ sql, binds });
        if (sql.includes("user_tab_columns")) {
          return { rows: [{ COLUMN_NAME: "HEADER_ID" }, { COLUMN_NAME: "FILE_ID" }, { COLUMN_NAME: "INVOICE_NUMBER" }] };
        }
        return { outBinds: { 3: [5] } };
      },
    };
    const id = await insertAdaptive(
      connection,
      "INVOICE_HEADER",
      [["HEADER_ID", 1], ["FILE_ID", 2], ["INVOICE_NUMBER", "X"], ["BILLING_ADDRESS", "dropped"]],
      "HEADER_ID",
      ["HEADER_ID", "FILE_ID"],
    );
    assert.equal(id, 5);
    const insert = seen.find((s) => s.sql.startsWith("INSERT INTO"));
    assert.match(insert.sql, /INVOICE_NUMBER/);
    assert.doesNotMatch(insert.sql, /BILLING_ADDRESS/);
    assert.deepEqual(insert.binds.slice(0, 3), [1, 2, "X"]);
  });

  it("fails loudly when a required id column is missing", async () => {
    const { insertAdaptive } = await import("../invoiceSource/Gmail/gmail-sync.mjs");
    const connection = {
      execute: async () => ({ rows: [{ COLUMN_NAME: "INVOICE_NUMBER" }] }),
    };
    await assert.rejects(
      insertAdaptive(connection, "INVOICE_HEADER", [["INVOICE_NUMBER", "X"]], "HEADER_ID", ["HEADER_ID", "FILE_ID"]),
      /missing columns: HEADER_ID, FILE_ID/,
    );
  });
});
