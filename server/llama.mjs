/**
 * Meta Model API client for invoice extraction (OpenAI-compatible chat completions).
 *
 * Docs: https://dev.meta.ai/docs/quickstart
 * Env: MODEL_API_KEY (preferred; META_API_KEY / LLAMA_API_KEY also accepted),
 *   META_MODEL (optional, default "muse-spark-1.3"),
 *   META_API_URL (optional override, default "https://api.meta.ai/v1/chat/completions").
 */
export function getLlamaConfig(env = process.env) {
  const apiKey = env.MODEL_API_KEY || env.META_API_KEY || env.LLAMA_API_KEY || "";
  if (!apiKey) throw new Error("Missing MODEL_API_KEY in .env (Meta Model API key).");
  return {
    apiKey,
    model: env.META_MODEL || "muse-spark-1.3",
    url: env.META_API_URL || "https://api.meta.ai/v1/chat/completions",
  };
}

export async function extractInvoiceWithLlama(prompt, { env = process.env, fetchImpl = fetch } = {}) {
  const { apiKey, model, url } = getLlamaConfig(env);
  const baseBody = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: "You extract vendor invoice fields and reply with JSON only." },
      { role: "user", content: prompt },
    ],
  };
  const send = (withJsonMode) =>
    fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        withJsonMode ? { ...baseBody, response_format: { type: "json_object" } } : baseBody,
      ),
    });
  let response = await send(true);
  if (!response.ok && response.status === 400) {
    // Some models/endpoints reject response_format; retry as plain JSON-only prompt.
    response = await send(false);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Meta Model API failed (${response.status}): ${String(detail).slice(0, 200)}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

/**
 * Step 2: convert a downloaded invoice PDF into invoiceSchema.json format
 * using the chat model. The PDF bytes go inline (file_data); the API
 * converts the PDF to text plus per-page images server-side.
 * No PDF parsing library is used. Returns the raw model text.
 */
export async function convertPdfToInvoiceJson(
  pdfBuffer,
  { filename = "invoice.pdf", schemaText = "", emailContext = "", env = process.env, fetchImpl = fetch } = {},
) {
  const { apiKey, model, url } = getLlamaConfig(env);
  const fileData = `data:application/pdf;base64,${Buffer.from(pdfBuffer).toString("base64")}`;
  const baseBody = {
    model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You convert invoice PDFs into JSON. Reply with JSON only, no markdown, no extra text.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Read the attached invoice PDF and return one JSON object matching this schema exactly.",
              "If a field is unknown use an empty string (or 0 for numbers).",
              emailContext ? `Email context: ${emailContext}` : "",
              `Schema: ${schemaText}`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
          { type: "file", file: { filename, file_data: fileData } },
        ],
      },
    ],
  };
  const send = (withJsonMode) =>
    fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        withJsonMode ? { ...baseBody, response_format: { type: "json_object" } } : baseBody,
      ),
    });
  let response = await send(true);
  if (!response.ok && response.status === 400) {
    response = await send(false);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Meta Model API failed (${response.status}): ${String(detail).slice(0, 200)}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}
