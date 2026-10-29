import { getDbStatus } from "../../server/db.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  res.status(200).json(await getDbStatus());
}
