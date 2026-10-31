import { getDbPool } from "../../server/db.mjs";
import { getPublishedInvoices } from "../../server/erp-consumer.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    res.status(200).json({ ok: true, invoices: await getPublishedInvoices(connection) });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors.
    }
  }
}
