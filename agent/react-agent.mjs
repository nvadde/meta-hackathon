/**
 * ReAct invoice agent: reads one PDF invoice and converts it to JSON using
 * knowledge/InvoiceSchema.json, the same schema SampleCodeToConvert.py uses.
 *
 * Loop per attempt: Thought -> Action (tool) -> Observation. The agent
 * inspects the PDF, asks the model to extract, validates the result against
 * the schema expectations, and retries with the validation errors until the
 * object is clean or attempts run out. The verified JSON is written to disk.
 *
 * Run: npm run agent:convert -- <invoice.pdf> [--out <result.json>] [--max-attempts 3]
 * Needs MODEL_API_KEY in .env (Meta Model API), same as the Gmail sync path.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { convertPdfToInvoiceJson } from "../server/llama.mjs";
import {
  buildExtractionPrompt,
  parseModelJson,
  readPdfMeta,
  validateExtraction,
} from "./tools.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
export const DEFAULT_SCHEMA_PATH = path.join(root, "knowledge", "InvoiceSchema.json");

function defaultModelFn({ pdfBuffer, filename, prompt }) {
  return convertPdfToInvoiceJson(pdfBuffer, { filename, schemaText: prompt });
}

function makeTracer(log) {
  const trace = [];
  const thought = (text) => {
    trace.push({ kind: "thought", text });
    log(`Thought: ${text}`);
  };
  const action = (tool, detail = "") => {
    trace.push({ kind: "action", tool, detail });
    log(`Action: ${tool}${detail ? ` (${detail})` : ""}`);
  };
  const observation = (text) => {
    trace.push({ kind: "observation", text });
    log(`Observation: ${text}`);
  };
  return { trace, thought, action, observation };
}

/**
 * Run the Thought/Action/Observation extraction loop without any file I/O,
 * so both the CLI and the server conversion endpoint can share it.
 * modelFn is injected for tests:
 * ({ pdfBuffer, filename, prompt, attempt, priorErrors }) => raw model text.
 */
export async function runExtractionLoop({
  pdfBuffer,
  filename,
  schemaText,
  modelFn = defaultModelFn,
  maxAttempts = 3,
  log = () => {},
}) {
  const { trace, thought, action, observation } = makeTracer(log);
  thought(`Convert ${filename} to InvoiceSchema JSON, up to ${maxAttempts} extraction attempts.`);
  const meta = readPdfMeta(pdfBuffer);
  observation(`${meta.bytes} bytes, about ${meta.pages} page(s).`);
  if (meta.bytes === 0) {
    thought("The PDF is empty, so extraction cannot proceed.");
    return { ok: false, attempts: 0, errors: ["PDF is empty."], trace };
  }

  let attempts = 0;
  let errors = [];
  while (attempts < maxAttempts) {
    attempts += 1;
    thought(
      attempts === 1
        ? "Extract every InvoiceSchema field from the PDF in one call."
        : `Fix the validation errors and return the full corrected object (attempt ${attempts}).`,
    );
    const prompt = buildExtractionPrompt({ schemaText, attempt: attempts, priorErrors: errors });
    action("llm_extract", `attempt ${attempts}`);
    let raw;
    try {
      raw = await modelFn({ pdfBuffer, filename, prompt, attempt: attempts, priorErrors: errors });
    } catch (error) {
      errors = [`Model call failed: ${error?.message || error}`];
      observation(`attempt ${attempts} failed: ${errors[0]}`);
      continue;
    }
    const data = parseModelJson(raw);
    observation(`model returned ${Object.keys(data).length} top-level keys.`);
    const checked = validateExtraction(data);
    if (checked.ok) {
      thought("Validation passed.");
      return { ok: true, attempts, errors: [], data, trace };
    }
    errors = checked.errors;
    observation(`validation failed: ${errors.join(" ")}`);
  }
  thought("Attempts are exhausted.");
  return { ok: false, attempts, errors, trace };
}

/**
 * CLI entry: read the PDF, run the shared extraction loop, write the
 * verified JSON to disk. modelFn is injected for tests:
 * ({ pdfBuffer, filename, prompt, attempt, priorErrors }) => raw model text.
 */
export async function runReactAgent({
  pdfPath,
  outPath,
  schemaText,
  modelFn = defaultModelFn,
  maxAttempts = 3,
  readFileFn = readFile,
  writeFileFn = writeFile,
  log = console.log,
}) {
  const { trace, thought, action } = makeTracer(log);
  thought(`Convert ${pdfPath} to InvoiceSchema JSON, up to ${maxAttempts} extraction attempts.`);
  action("read_pdf", pdfPath);
  const pdfBuffer = await readFileFn(pdfPath);
  const result = await runExtractionLoop({
    pdfBuffer,
    filename: path.basename(pdfPath),
    schemaText,
    modelFn,
    maxAttempts,
    log: () => {},
  });
  trace.push(...result.trace);
  if (!result.ok) {
    thought("Attempts are exhausted, so nothing is written.");
    return { ...result, trace };
  }
  thought("Validation passed, so the JSON can be written.");
  action("write_json", outPath);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFileFn(outPath, `${JSON.stringify(result.data, null, 2)}\n`);
  trace.push({ kind: "observation", text: `wrote ${outPath}.` });
  return { ...result, trace };
}

const invokedAsCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  try {
    process.loadEnvFile(path.join(root, ".env"));
  } catch {
    // MODEL_API_KEY may come from the environment instead.
  }
  const [pdfArg, ...rest] = process.argv.slice(2);
  const outFlag = rest.indexOf("--out");
  const attemptsFlag = rest.indexOf("--max-attempts");
  const positional = rest.filter((arg) => !arg.startsWith("--"));
  if (!pdfArg) {
    console.error("Usage: npm run agent:convert -- <invoice.pdf> [--out <result.json>] [--max-attempts 3]");
    process.exit(1);
  }
  const pdfPath = path.resolve(root, pdfArg);
  const outArg =
    (outFlag >= 0 && rest[outFlag + 1]) || (positional[0] && !/^\d+$/.test(positional[0]) && positional[0]) || null;
  const outPath = outArg
    ? path.resolve(root, outArg)
    : path.join(here, "out", `${path.basename(pdfArg, path.extname(pdfArg))}.json`);
  const attemptsArg =
    (attemptsFlag >= 0 && rest[attemptsFlag + 1]) || positional.find((arg) => /^\d+$/.test(arg));
  const schemaText = await readFile(DEFAULT_SCHEMA_PATH, "utf8");
  const result = await runReactAgent({
    pdfPath,
    outPath,
    schemaText,
    maxAttempts: Number(attemptsArg) || 3,
  });
  console.log(JSON.stringify({ ok: result.ok, attempts: result.attempts, outPath, errors: result.errors }, null, 2));
  process.exit(result.ok ? 0 : 1);
}
