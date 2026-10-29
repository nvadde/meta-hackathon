import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runReactAgent } from "../agent/react-agent.mjs";
import { buildExtractionPrompt, parseModelJson, validateExtraction } from "../agent/tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let tmpSeq = 0;
function makeTmpDir() {
  const dir = path.join(root, "agent", "out", `.test-${process.pid}-${tmpSeq++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test("parseModelJson strips fences and parses", () => {
  assert.deepEqual(parseModelJson('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('{"a": 2}'), { a: 2 });
  assert.deepEqual(parseModelJson("not json"), {});
});

test("validateExtraction accepts a complete invoice", () => {
  const result = validateExtraction({
    InvoiceId: "844707",
    VendorName: "KATH FUEL OIL",
    AmountDue: 780.49,
    Items: [{ LineNum: 1, Amount: 714.4 }, { LineNum: 2, Amount: 66.09 }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validateExtraction rejects missing fields and bad totals", () => {
  const result = validateExtraction({ VendorName: "X", AmountDue: 0, Items: [{ Amount: "NaN" }] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("invoice number")));
  assert.ok(result.errors.some((e) => e.includes("AmountDue")));
});

test("agent retries a failed extraction and writes the fixed JSON", async () => {
  const dir = makeTmpDir();
  const outPath = path.join(dir, "inv.json");
  const calls = [];
  const modelFn = async ({ attempt, priorErrors }) => {
    calls.push({ attempt, priorErrors });
    if (attempt === 1) return '{"VendorName": "X"}';
    return '{"InvoiceId": "INV-1", "VendorName": "X", "AmountDue": 10, "Items": [{"Amount": 10}]}';
  };
  const result = await runReactAgent({
    pdfPath: "files/invoices/inv-2041.pdf",
    outPath,
    schemaText: "[]",
    modelFn,
    log: () => {},
  });
  assert.equal(result.attempts, 2);
  assert.equal(result.ok, true);
  assert.equal(calls[1].priorErrors.length > 0, true);
  const written = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(written.InvoiceId, "INV-1");
  rmSync(dir, { recursive: true, force: true });
  assert.ok(result.trace.some((step) => step.kind === "thought"));
  assert.ok(result.trace.some((step) => step.kind === "observation"));
});

test("agent gives up after max attempts without writing", async () => {
  const dir = makeTmpDir();
  const outPath = path.join(dir, "inv.json");
  const result = await runReactAgent({
    pdfPath: "files/invoices/inv-2041.pdf",
    outPath,
    schemaText: "[]",
    modelFn: async () => '{"nope": true}',
    maxAttempts: 2,
    log: () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 2);
  assert.throws(() => readFileSync(outPath, "utf8"));
  rmSync(dir, { recursive: true, force: true });
});

test("agent survives model call failures and reports them", async () => {
  const dir = makeTmpDir();
  const outPath = path.join(dir, "inv.json");
  const result = await runReactAgent({
    pdfPath: "files/invoices/inv-2041.pdf",
    outPath,
    schemaText: "[]",
    modelFn: async () => {
      throw new Error("fetch failed");
    },
    maxAttempts: 2,
    log: () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 2);
  assert.ok(result.errors.some((e) => e.includes("Model call failed")));
  assert.throws(() => readFileSync(outPath, "utf8"));
  rmSync(dir, { recursive: true, force: true });
});

test("buildExtractionPrompt includes schema and prior errors on retry", () => {
  const first = buildExtractionPrompt({ schemaText: "SCHEMA", attempt: 1, priorErrors: [] });
  assert.ok(first.includes("SCHEMA"));
  assert.ok(!first.includes("Previous attempt failed"));
  const retry = buildExtractionPrompt({ schemaText: "SCHEMA", attempt: 2, priorErrors: ["bad total"] });
  assert.ok(retry.includes("bad total"));
});
