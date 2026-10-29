import { getDbPool } from "../../server/db.mjs";
import { enqueueForErp } from "../../server/erp-queue.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const headerId = Number(body.headerId);
  if (!Number.isInteger(headerId)) {
    res.status(400).json({ error: "headerId is required." });
    return;
  }
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    const stored = await enqueueForErp(connection, headerId, {
      erpSystem: typeof body.erpSystem === "string" ? body.erpSystem : "",
      createdBy: "SIRE",
    });
    await connection.commit();
    res.status(stored.status === "already-queued" ? 200 : 201).json({ ok: true, ...stored });
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {
      // Ignore rollback errors; report the original failure.
    }
    res.status(400).json({ ok: false, error: String(error?.message || error) });
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors.
    }
  }
}
