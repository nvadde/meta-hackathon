import { syncGmailInvoices } from "../../../invoiceSource/Gmail/gmail-sync.mjs";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const mode = body.mode === "react" ? "react" : "llama";
    res.status(200).json({ ok: true, ...(await syncGmailInvoices({ mode })) });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
