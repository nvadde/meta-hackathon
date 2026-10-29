import { getDbPool } from "../../server/db.mjs";
import { markReadyInvoices } from "../../server/readiness.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    const result = await markReadyInvoices(connection, { createdBy: "SIRE" });
    await connection.commit();
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors.
    }
  }
}
