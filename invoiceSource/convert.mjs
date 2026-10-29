/**
 * Shared PDF-to-JSON conversion for every invoice source (Gmail, WhatsApp,
 * Manual Upload). Each channel stages the received file under its own
 * files/<Channel>/ folder and reads it back here: the model call, the
 * schema, and the normalization are identical no matter the source.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runExtractionLoop } from "../agent/react-agent.mjs";
import { convertPdfToInvoiceJson } from "../server/llama.mjs";
import { parseLlamaInvoice, parseMuseInvoice } from "./Gmail/gmail-ingest.mjs";

const agentSchemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "knowledge",
  "InvoiceSchema.json",
);

/** The InvoiceSchema text the agentic loop validates against. */
export function readAgentSchema() {
  return readFile(agentSchemaPath, "utf8");
}

/**
 * Convert staged PDF bytes to a normalized invoice draft.
 * Failures propagate so the caller can fall back (e.g. low-confidence
 * defaults for WhatsApp, user-typed values for Manual Upload).
 */
export async function convertStagedPdf(
  pdfBuffer,
  { filename, schemaText, emailContext = "", fallback = {}, convertFn = convertPdfToInvoiceJson },
) {
  const raw = await convertFn(pdfBuffer, { filename, schemaText, emailContext });
  return { raw, draft: parseLlamaInvoice(raw, fallback) };
}

/**
 * Option 1 (llama): direct single-call extraction using the shared
 * conversion. Same bytes-to-draft path for every source.
 */
export async function runLlamaPipeline(
  stagedBytes,
  { filename, schemaText, emailContext = "", fallback = {}, convertFn } = {},
) {
  const { draft } = await convertStagedPdf(stagedBytes, {
    filename,
    schemaText,
    emailContext,
    fallback,
    ...(convertFn ? { convertFn } : {}),
  });
  return { draft, extracted: true };
}

/**
 * Option 2 (agentic ReAct): the validating Thought/Action/Observation loop
 * over the same PDF bytes, in the knowledge/InvoiceSchema.json format.
 * Throws when validation never passes so the caller can fall back.
 */
export async function runReactPipeline(
  stagedBytes,
  { filename, schemaText, fallback = {}, maxAttempts = 3, modelFn, log } = {},
) {
  const { ok, attempts, data, errors } = await runExtractionLoop({
    pdfBuffer: stagedBytes,
    filename,
    schemaText,
    ...(modelFn ? { modelFn } : {}),
    maxAttempts,
    ...(log ? { log } : {}),
  });
  if (!ok) {
    throw new Error(`Agentic extraction failed: ${errors.join(" ")}`);
  }
  return { draft: parseMuseInvoice(data, fallback), agentData: data, attempts, extracted: true };
}

/**
 * Shared staged-PDF conversion honoring the Dashboard engine toggle.
 * "react" runs the validating agentic loop; anything else (or a react
 * failure) uses the direct llama extraction. Returns the draft plus the
 * engine that actually produced it.
 */
export async function convertWithEngine(
  stagedBytes,
  { filename, llamaSchemaText, emailContext = "", fallback = {}, engine = "llama", convertFn, modelFn, maxAttempts = 3 },
) {
  if (engine === "react") {
    try {
      const agentSchemaText = await readAgentSchema();
      const { draft, attempts } = await runReactPipeline(stagedBytes, {
        filename,
        schemaText: agentSchemaText,
        fallback,
        ...(modelFn ? { modelFn } : {}),
        maxAttempts,
      });
      return { draft, engine: "react", attempts };
    } catch {
      // Fall through to direct extraction so the receipt is not lost.
    }
  }
  const { draft } = await runLlamaPipeline(stagedBytes, {
    filename,
    schemaText: llamaSchemaText,
    emailContext,
    fallback,
    ...(convertFn ? { convertFn } : {}),
  });
  return { draft, engine: "llama" };
}

/** Map validated agentic output onto the manual form shape (dotted muse.ai keys included). */
export function agentDataToManualFields(data) {
  const first = (data.Items ?? data.items ?? data["lineitem.Items"] ?? [])[0] || {};
  return {
    invoiceNumber: data.InvoiceId ?? data.invoice_number ?? "",
    supplier: data.VendorName ?? data.vendor_name ?? "",
    amount: data.AmountDue ?? data.InvoiceTotal ?? data.amount_due ?? 0,
    currency: data.Currency ?? data.currency ?? "USD",
    invoiceDate: data.InvoiceDate ?? data.invoice_date ?? "",
    lineDescription:
      first.Description ?? first.description ?? first["lineitem.Description"] ?? first.Name ?? first.name ?? "",
    lineQuantity: first.Quantity ?? first.quantity ?? first["lineitem.Quantity"] ?? 1,
    lineUnits: first.Unit ?? first.units ?? first["lineitem.Unit"] ?? "ea",
    lineAmount: first.Amount ?? first.amount ?? first["lineitem.Amount"] ?? 0,
  };
}

export function isBlank(value) {
  return String(value ?? "").trim().length === 0;
}

function blank(value) {
  return isBlank(value);
}

/**
 * Overlay an extracted draft onto user-typed manual fields. User values
 * always win; extraction only fills fields the user left blank. Returns
 * the merged fields plus which keys were filled, for transparency.
 */
export function mergeManualFields(userFields, extractedDraft) {
  const extracted = extractedDraft || {};
  const extractedLine = (extracted.lines || [])[0] || {};
  const take = (userValue, extractedValue) => (blank(userValue) ? String(extractedValue ?? "") : userValue);
  const merged = {
    ...userFields,
    projectNumber: take(userFields.projectNumber, extracted.projectNumber),
    jobNumber: take(userFields.jobNumber, extracted.jobNumber),
    invoiceDate: take(userFields.invoiceDate, extracted.invoiceDate),
    remittanceAddress: take(userFields.remittanceAddress, extracted.remittanceAddress),
    billToAddress: take(userFields.billToAddress, extracted.billingAddress || extracted.customerAddress),
    lineDescription: take(userFields.lineDescription, extractedLine.description),
    lineUnits: take(userFields.lineUnits, extractedLine.units),
  };
  const filledKeys = Object.keys(merged).filter(
    (key) => key !== "project" && blank(userFields[key]) && !blank(merged[key]),
  );
  return { merged, filledKeys };
}
