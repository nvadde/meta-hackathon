import assert from "node:assert/strict";
import test from "node:test";

import {
  mapInvoiceRows,
  mapProjectRow,
  mapSupplierRow,
  normalizeSource,
} from "../server/live-data.mjs";

test("mapSupplierRow and mapProjectRow shape Oracle rows like the ERP feeds", () => {
  assert.deepEqual(
    mapSupplierRow({
      SUPPLIER_NAME: "Atlas Concrete Ltd",
      STATUS: "Active",
      START_DATE: new Date("2023-02-01T00:00:00Z"),
      END_DATE: null,
      SUPPLIER_SITE: "Austin Plant",
      SUPPLIER_ADDRESS: "44 Quarry Rd",
    }),
    {
      supplier: "Atlas Concrete Ltd",
      status: "Active",
      startDate: "2023-02-01",
      endDate: null,
      site: "Austin Plant",
      address: "44 Quarry Rd",
    },
  );
  assert.deepEqual(
    mapProjectRow({
      PROJECT_NAME: "Riverside Tower",
      PROJECT_NUMBER: "PRJ-101",
      STATUS: "Inactive",
      START_DATE: new Date("2024-03-01T00:00:00Z"),
      END_DATE: new Date("2026-06-30T00:00:00Z"),
      PROJECT_ADDRESS: "12 Riverbank Ave",
    }),
    {
      project: "Riverside Tower",
      projectNumber: "PRJ-101",
      status: "Inactive",
      startDate: "2024-03-01",
      endDate: "2026-06-30",
      address: "12 Riverbank Ave",
    },
  );
});

test("normalizeSource maps Oracle source values to channel badges", () => {
  assert.equal(normalizeSource("Gmail"), "Gmail");
  assert.equal(normalizeSource("GMAIL"), "Gmail");
  assert.equal(normalizeSource("whatsapp"), "WhatsApp");
  assert.equal(normalizeSource("WhatsApp"), "WhatsApp");
  assert.equal(normalizeSource("Manual Upload"), "Manual Upload");
  assert.equal(normalizeSource("Manual"), "Manual Upload");
  assert.equal(normalizeSource("Upload"), "Manual Upload");
  assert.equal(normalizeSource(null), "Manual Upload");
  assert.equal(normalizeSource(" carrier pigeon "), "Manual Upload");
  assert.equal(normalizeSource(null, "files/Gmail/gmail-1-a.pdf"), "Gmail");
  assert.equal(normalizeSource("", "files/Whatsapp/whatsapp-1-b.pdf"), "WhatsApp");
  assert.equal(normalizeSource("legacy", "files/Manual/manual-1-c.pdf"), "Manual Upload");
  assert.equal(normalizeSource(" carrier pigeon ", "files/invoices/gmail-1793226427993-844781.pdf"), "Gmail");
  assert.equal(normalizeSource("Manual Upload", "files/Gmail/gmail-1-a.pdf"), "Manual Upload");
});

test("mapInvoiceRows keeps the live source channel", () => {
  const [one, two] = mapInvoiceRows(
    [
      { HEADER_ID: 1, FILE_ID: 1, INVOICE_NUMBER: "A", INVOICE_SOURCE: "GMAIL" },
      { HEADER_ID: 2, FILE_ID: 2, INVOICE_NUMBER: "B", INVOICE_SOURCE: "whatsapp" },
    ],
    [],
  );
  assert.equal(one.source, "Gmail");
  assert.equal(two.source, "WhatsApp");
});

test("mapInvoiceRows groups lines under headers and carries the file path", () => {
  const invoices = mapInvoiceRows(
    [
      {
        HEADER_ID: 7,
        FILE_ID: 3,
        FILE_NAME: "inv-1.pdf",
        FILE_PATH: "files/invoices/inv-1.pdf",
        INVOICE_NUMBER: "INV-1",
        SUPPLIER_NAME: "Atlas Concrete Ltd",
        PROJECT_NAME: "Riverside Tower",
        PROJECT_NUMBER: "PRJ-101",
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
        PAYABLES_REVIEW_CONFIRMED: "Y",
      },
    ],
    [
      { HEADER_ID: 7, LINE_NUM: "1", DESCRIPTION: "Concrete", QUANTITY: 2, UNITS: "m3", UNIT_PRICE: 100, AMOUNT: 200 },
      { HEADER_ID: 7, LINE_NUM: "2", DESCRIPTION: "Pump", QUANTITY: 1, UNITS: "ea", UNIT_PRICE: 100, AMOUNT: 100 },
      { HEADER_ID: 99, LINE_NUM: "1", DESCRIPTION: "Orphan", QUANTITY: 1, UNITS: "ea", UNIT_PRICE: 1, AMOUNT: 1 },
    ],
  );
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].id, "db-7");
  assert.equal(invoices[0].filePath, "files/invoices/inv-1.pdf");
  assert.equal(invoices[0].payablesReviewConfirmed, true);
  assert.equal(invoices[0].lines.length, 2);
  assert.equal(invoices[0].lines[0].description, "Concrete");
});
