# Invoice ReAct agent

Reads one PDF invoice and converts it to JSON using
[InvoiceSchema.json](../knowledge/InvoiceSchema.json) — the same schema
[SampleCodeToConvert.py](../sample/SampleCodeToConvert.py) targets.

## Run

```sh
npm run agent:convert -- files/invoices/inv-2041.pdf
npm run agent:convert -- files/invoices/inv-2041.pdf --out agent/out/inv-2041.json --max-attempts 3
```

Needs `MODEL_API_KEY` in `.env` (Meta Model API), the same key the Gmail
sync path uses. Output defaults to `agent/out/<invoice-name>.json`.

## How it works

Thought → Action → Observation loop in
[react-agent.mjs](./react-agent.mjs), with tools in [tools.mjs](./tools.mjs):

1. `read_pdf` — size and approximate page count (no PDF library).
2. `llm_extract` — model reads the PDF bytes and returns one JSON object
   using the schema keys (reuses `server/llama.mjs`, the chat-completions
   inline-PDF path, like the existing ingest pipeline).
3. `validate` — checks invoice number, vendor, a positive header total,
   present line items with numeric amounts, and lines-total reconciliation.
4. On failure the validation errors go back into the next attempt's prompt
   until the object is clean or attempts run out. Only validated JSON is
   written; a failed run writes nothing and exits non-zero.

Tests live in `tests/react-agent.test.mjs` and run with `npm test`.
