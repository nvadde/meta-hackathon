import assert from "node:assert/strict";
import test from "node:test";

import {
  agentDataToManualFields,
  convertStagedPdf,
  convertWithEngine,
  mergeManualFields,
  readAgentSchema,
  runLlamaPipeline,
  runReactPipeline,
} from "../invoiceSource/convert.mjs";

const MODEL_JSON = JSON.stringify({
  InvoiceId: "844707",
  VendorName: "KATH FUEL OIL SERVICE CO",
  InvoiceDate: "2026-01-22",
  AmountDue: 780.49,
  Currency: "USD",
  ProjectNumber: "PRJ-1",
  "lineitem.Items": [
    { "lineitem.LineNum": 1, "lineitem.Description": "Fuel", "lineitem.Quantity": 2, "lineitem.Amount": 780.49 },
  ],
});

test("convertStagedPdf parses model output into a draft", async () => {
  const seen = {};
  const { raw, draft } = await convertStagedPdf(Buffer.from("%PDF-"), {
    filename: "a.pdf",
    schemaText: "SCHEMA",
    emailContext: "ctx",
    convertFn: async (buffer, opts) => {
      seen.opts = opts;
      return MODEL_JSON;
    },
  });
  assert.equal(raw, MODEL_JSON);
  assert.equal(draft.invoiceNumber, "844707");
  assert.equal(draft.vendorName, "KATH FUEL OIL SERVICE CO");
  assert.equal(draft.amountDue, 780.49);
  assert.equal(draft.lines.length, 1);
  assert.equal(seen.opts.filename, "a.pdf");
  assert.equal(seen.opts.schemaText, "SCHEMA");
  assert.equal(seen.opts.emailContext, "ctx");
});

test("convertStagedPdf failures propagate to the caller fallback", async () => {
  await assert.rejects(
    convertStagedPdf(Buffer.from("%PDF-"), {
      filename: "a.pdf",
      schemaText: "SCHEMA",
      convertFn: async () => {
        throw new Error("model down");
      },
    }),
    /model down/,
  );
});

test("runLlamaPipeline returns the shared draft in one call", async () => {
  const { draft, extracted } = await runLlamaPipeline(Buffer.from("%PDF-"), {
    filename: "a.pdf",
    schemaText: "SCHEMA",
    convertFn: async () => MODEL_JSON,
  });
  assert.equal(extracted, true);
  assert.equal(draft.invoiceNumber, "844707");
});

test("runReactPipeline validates through the agentic loop", async () => {
  const modelFn = async ({ attempt }) =>
    attempt === 1 ? '{"VendorName": "X"}' : MODEL_JSON;
  const { draft, agentData, attempts, extracted } = await runReactPipeline(Buffer.from("%PDF-"), {
    filename: "a.pdf",
    schemaText: "[]",
    modelFn,
    log: () => {},
  });
  assert.equal(extracted, true);
  assert.equal(attempts, 2);
  assert.equal(draft.invoiceNumber, "844707");
  assert.equal(agentData.VendorName, "KATH FUEL OIL SERVICE CO");
  await assert.rejects(
    runReactPipeline(Buffer.from("%PDF-"), {
      filename: "a.pdf",
      schemaText: "[]",
      modelFn: async () => '{"nope": true}',
      maxAttempts: 1,
      log: () => {},
    }),
    /Agentic extraction failed/,
  );
});

test("agentDataToManualFields maps validated output onto the form", () => {
  const form = agentDataToManualFields(JSON.parse(MODEL_JSON));
  assert.equal(form.invoiceNumber, "844707");
  assert.equal(form.supplier, "KATH FUEL OIL SERVICE CO");
  assert.equal(form.amount, 780.49);
  assert.equal(form.lineAmount, 780.49);
  assert.equal(form.lineUnits, "ea");
});

test("readAgentSchema loads the InvoiceSchema keys", async () => {
  const text = await readAgentSchema();
  const entries = JSON.parse(text);
  assert.ok(Array.isArray(entries));
  assert.ok(entries.some((entry) => entry.key === "InvoiceNumber"));
});

test("convertWithEngine honors the toggle and falls back to llama", async () => {
  const direct = await convertWithEngine(Buffer.from("%PDF-"), {
    filename: "a.pdf",
    llamaSchemaText: "{}",
    engine: "llama",
    convertFn: async () => MODEL_JSON,
  });
  assert.equal(direct.engine, "llama");
  assert.equal(direct.draft.invoiceNumber, "844707");

  const agentic = await convertWithEngine(Buffer.from("%PDF-"), {
    filename: "a.pdf",
    llamaSchemaText: "{}",
    engine: "react",
    modelFn: async () => MODEL_JSON,
  });
  assert.equal(agentic.engine, "react");
  assert.equal(agentic.draft.invoiceNumber, "844707");
  assert.equal(agentic.attempts, 1);

  const fallback = await convertWithEngine(Buffer.from("%PDF-"), {
    filename: "a.pdf",
    llamaSchemaText: "{}",
    engine: "react",
    modelFn: async () => {
      throw new Error("model down");
    },
    convertFn: async () => MODEL_JSON,
  });
  assert.equal(fallback.engine, "llama");
  assert.equal(fallback.draft.invoiceNumber, "844707");
});

test("mergeManualFields lets user values win and fills blanks from extraction", () => {
  const user = {
    invoiceNumber: "INV-1",
    supplier: "User Supplier",
    project: "",
    projectNumber: "",
    jobNumber: "",
    remittanceAddress: "",
    billToAddress: "User Bill",
    lineDescription: "",
    lineUnits: "",
  };
  const extracted = {
    invoiceNumber: "INV-9",
    vendorName: "Model Vendor",
    projectNumber: "PRJ-9",
    jobNumber: "JOB-9",
    remittanceAddress: "Model Remit",
    billingAddress: "Model Bill",
    lines: [{ description: "Model line", units: "m" }],
  };
  const { merged, filledKeys } = mergeManualFields(user, extracted);
  assert.equal(merged.invoiceNumber, "INV-1");
  assert.equal(merged.supplier, "User Supplier");
  assert.equal(merged.projectNumber, "PRJ-9");
  assert.equal(merged.jobNumber, "JOB-9");
  assert.equal(merged.remittanceAddress, "Model Remit");
  assert.equal(merged.billToAddress, "User Bill");
  assert.equal(merged.lineDescription, "Model line");
  assert.equal(merged.lineUnits, "m");
  assert.ok(filledKeys.includes("projectNumber"));
  assert.ok(!filledKeys.includes("invoiceNumber"));
});
