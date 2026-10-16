// 全件を返す（583件程度なので、検索はブラウザ側で行う）
import { getItems } from "../../lib/sheet.js";

export default async function handler(req, res) {
  try {
    const { at, items } = await getItems();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ loadedAt: at, items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
