// pages/api/flyers/search.js
import { searchFlyers } from "../../../lib/flyerEngine.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const { mode = "AND", keywords = [], page = 1, pageSize = 12 } = req.body || {};
    const data = await searchFlyers({ mode, keywords, page, pageSize });
    return res.status(200).json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
