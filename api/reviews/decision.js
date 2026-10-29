import { getDbPool } from "../../../server/db.mjs";
import { recordReviewDecision } from "../../../server/review-decision.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  let connection;
  try {
    connection = await (await getDbPool()).getConnection();
    const stored = await recordReviewDecision(connection, {
      headerId: Number(body.headerId),
      decision: body.decision,
      remarks: body.remarks,
      actionBy: typeof body.actionBy === "string" ? body.actionBy : "",
    });
    await connection.commit();
    res.status(200).json({ ok: true, ...stored });
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
