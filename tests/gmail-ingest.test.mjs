import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  buildLlamaPrompt,
  decodeAttachmentBody,
  listPdfAttachments,
  parseLlamaInvoice,
  parseMuseInvoice,
} from "../invoiceSource/Gmail/gmail-ingest.mjs";
import { convertPdfToInvoiceJson, extractInvoiceWithLlama, getLlamaConfig } from "../server/llama.mjs";

describe("gmail-ingest", () => {
  it("finds nested PDF attachments", () => {
    const message = {
      payload: {
        parts: [
          { mimeType: "text/plain", body: {} },
          {
            mimeType: "multipart/mixed",
            parts: [
              { mimeType: "application/pdf", filename: "inv.pdf", body: { attachmentId: "a1" } },
            ],
          },
        ],
      },
    };
    assert.deepEqual(listPdfAttachments(message), [
      { attachmentId: "a1", filename: "inv.pdf", size: 0 },
    ]);
  });

  it("builds a prompt and parses the model reply", () => {
    const prompt = buildLlamaPrompt({
      subject: "Invoice INV-9",
      from: "vendor@example.com",
      date: "2026-10-01",
      snippet: "please pay",
      filename: "inv.pdf",
    });
    assert.match(prompt, /INV-9/);
    const draft = parseLlamaInvoice(
      '{"invoice_number":"INV-9","vendor_name":"Acme","invoice_date":"2026-10-01","amount_due":120,"currency":"USD","project_number":"","notes":""}',
      { messageId: "m1" },
    );
    assert.equal(draft.invoiceNumber, "INV-9");
    assert.equal(draft.lowConfidence, false);
  });

  it("flags low-confidence drafts for payables review", () => {
    const draft = parseLlamaInvoice("not json", { messageId: "m2" });
    assert.equal(draft.lowConfidence, true);
    assert.match(draft.invoiceNumber, /GMAIL-/);
  });

  it("empties unparseable model dates so Oracle never sees Invalid Date", () => {
    const draft = parseLlamaInvoice(
      '{"invoice_number":"INV-1","vendor_name":"Acme","invoice_date":"sometime soon","amount_due":5,"currency":"USD","project_number":"","notes":""}',
      { messageId: "m3" },
    );
    assert.equal(draft.invoiceDate, "");
  });

  it("normalizes schema lines and extra header fields", () => {
    const draft = parseLlamaInvoice(
      '{"invoice_number":"INV-1","vendor_name":"Acme","invoice_date":"2026-10-26","due_date":"2026-11-26","amount_due":150,"currency":"EUR","project_number":"P1","job_number":"J1","payment_terms":"Net 30","total_tax":10,"notes":"n","lines":[{"line_num":"1","description":"Widgets","quantity":2,"units":"ea","unit_price":75,"amount":150}]}',
      { messageId: "m4" },
    );
    assert.equal(draft.dueDate, "2026-11-26");
    assert.equal(draft.jobNumber, "J1");
    assert.equal(draft.lines.length, 1);
    assert.equal(draft.lines[0].description, "Widgets");
    assert.equal(draft.lines[0].amount, 150);
  });

  it("decodes gmail base64url bodies", () => {
    assert.equal(decodeAttachmentBody("JVBERi0x").toString("latin1").slice(0, 6), "%PDF-1");
  });

  it("requires a Meta Model API key", () => {
    assert.throws(() => getLlamaConfig({}), /MODEL_API_KEY/);
    assert.equal(getLlamaConfig({ MODEL_API_KEY: "k" }).model, "muse-spark-1.3");
    assert.equal(
      getLlamaConfig({ MODEL_API_KEY: "k" }).url,
      "https://api.meta.ai/v1/chat/completions",
    );
  });

  it("retries without json mode when the endpoint rejects it", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push(JSON.parse(options.body));
      if (calls.length === 1) {
        return { ok: false, status: 400, text: async () => "bad request", json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }),
      };
    };
    const text = await extractInvoiceWithLlama("prompt", {
      env: { MODEL_API_KEY: "k" },
      fetchImpl,
    });
    assert.equal(text, '{"a":1}');
    assert.equal(calls.length, 2);
    assert.ok(!("response_format" in calls[1]));
  });

  it("normalizes muse.ai dotted-key JSON into a Tables.sql draft", () => {
    const draft = parseMuseInvoice(
      {
        InvoiceId: "844708",
        InvoiceDate: "2026-01-22",
        DueDate: "2026-02-15",
        VendorName: "KATH FUEL OIL SERVICE CO",
        VendorAddress: "3096 RICE ST, LITTLE CANADA, MN 55113",
        BillingAddress: "BOX 1333, MINNEAPOLIS, MN 55440-1333",
        BillingAddressRecipient: "MORTENSON CO, M A",
        PaymentTerm: "15TH OF FOLLOWING MO",
        PurchaseOrder: "JOB# 23120003",
        AmountDue: 2640.1,
        InvoiceTotal: 2640.1,
        TotalTax: 203.62,
        "lineitem.Items": [
          {"lineitem.LineNum": 1, "lineitem.Name": "ULTRA LOW #1 DYED", "lineitem.ProductCode": "913", "lineitem.Quantity": 670.1, "lineitem.Unit": "GAL", "lineitem.UnitPrice": 3.636, "lineitem.Amount": 2436.48, "lineitem.Description": "Dyed ULSD", "lineitem.Tax": null},
          {"lineitem.LineNum": 2, "lineitem.Name": "MN INSP FEE", "lineitem.Quantity": 670.1, "lineitem.UnitPrice": 0.0067, "lineitem.Amount": 4.49, "lineitem.Tax": 4.49},
        ],
      },
      {},
    );
    assert.equal(draft.lowConfidence, false);
    assert.equal(draft.invoiceNumber, "844708");
    assert.equal(draft.vendorName, "KATH FUEL OIL SERVICE CO");
    assert.equal(draft.amountDue, 2640.1);
    assert.equal(draft.dueDate, "2026-02-15");
    assert.equal(draft.billingAddress, "BOX 1333, MINNEAPOLIS, MN 55440-1333");
    assert.equal(draft.paymentTerms, "15TH OF FOLLOWING MO");
    assert.match(draft.notes, /JOB# 23120003/);
    assert.equal(draft.lines.length, 2);
    assert.equal(draft.lines[0].productCode, "913");
    assert.equal(draft.lines[0].quantity, 670.1);
    assert.equal(draft.lines[1].productCode, "");
  });

  it("sends the staged PDF inline to the chat model with the schema", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"invoice_number":"X"}' } }] }),
      };
    };
    const text = await convertPdfToInvoiceJson(Buffer.from("%PDF-1 fake"), {
      filename: "inv.pdf",
      schemaText: '{"title":"SIRE invoice extraction"}',
      emailContext: "subject",
      env: { MODEL_API_KEY: "k" },
      fetchImpl,
    });
    assert.equal(text, '{"invoice_number":"X"}');
    assert.equal(calls[0].model, "muse-spark-1.3");
    const userContent = calls[0].messages[1].content;
    assert.match(userContent[0].text, /SIRE invoice extraction/);
    assert.equal(userContent[1].type, "file");
    assert.equal(userContent[1].file.filename, "inv.pdf");
    assert.match(userContent[1].file.file_data, /^data:application\/pdf;base64,/);
  });
});
