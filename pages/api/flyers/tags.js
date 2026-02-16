// api/flyers/tags.js
import { getFacets } from "../../../lib/flyerEngine.js";


export default async function handler(req, res) {
  try {
    // facetsを空条件で取得すると全tagが含まれる（facets keys）
    const data = await getFacets({ mode: "AND", keywords: [] });
    return res.status(200).json({ tags: Object.keys(data.facets || {}), count: data.count });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
