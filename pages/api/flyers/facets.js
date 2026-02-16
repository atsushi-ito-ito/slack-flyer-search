// pages/api/flyers/facets.js
import { getFacets } from "../../../lib/flyerEngine.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const { mode = "AND", keywords = [] } = req.body || {};
    const data = await getFacets({ mode, keywords });
    return res.status(200).json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
