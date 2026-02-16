// lib/flyerEngine.js
import { google } from "googleapis";

/** ====== 設定 ====== */
const TTL_MS = 60 * 1000; // 1分キャッシュ（高速化）
let CACHE = null; // { at:number, rows:Array, tagsByRow:Array, idsByTag:Map, allTags:Array }

function splitTokens(s) {
  if (!s) return [];
  return String(s)
    .split(/[\n,、\s]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function rowToTags(r) {
  const tags = new Set();

  // ヘッダー対応:
  // area,prefectures,municipalities,property_name,style,target,layout,keyword,developer
  splitTokens(r.area).forEach((x) => tags.add(x));
  splitTokens(r.prefectures).forEach((x) => tags.add(x));
  splitTokens(r.municipalities).forEach((x) => tags.add(x));
  splitTokens(r.style).forEach((x) => tags.add(x));
  splitTokens(r.target).forEach((x) => tags.add(x));
  splitTokens(r.layout).forEach((x) => tags.add(x));
  splitTokens(r.developer).forEach((x) => tags.add(x));
  splitTokens(r.keyword).forEach((x) => tags.add(x));

  return Array.from(tags);
}

function intersect(a, b) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set();
  for (const v of small) if (big.has(v)) out.add(v);
  return out;
}

function union(a, b) {
  const out = new Set(a);
  for (const v of b) out.add(v);
  return out;
}

/** ====== Sheets読み込み（ここが移植ポイント） ====== */
async function loadSheetRows() {
  const sheetUrl = process.env.SHEET_URL;
  if (!sheetUrl) throw new Error("SHEET_URL is not set");

  const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid SHEET_URL");
  const spreadsheetId = match[1];

  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT is not set or invalid");
  }

  const privateKey = (serviceAccount.private_key || "").replace(/\\n/g, "\n");

const auth = new google.auth.JWT({
  email: serviceAccount.client_email,
  key: privateKey,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});


  const sheets = google.sheets({ version: "v4", auth });

  // range はまず A:Z にしておくのが安全（シート名が不明でも動く）
  const range = process.env.SHEET_RANGE || "A:Z";

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const values = res.data.values || [];
  if (values.length < 2) return [];

  const headers = (values[0] || []).map((h) => String(h || "").trim());
  const rows = values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i] ?? ""));
    return obj;
  });

  return rows.filter((r) => r.url); // urlが空行なら落とす（任意）
}


/** ====== インデックス作成（キャッシュ） ====== */
async function getIndex() {
  const now = Date.now();
  if (CACHE && now - CACHE.at < TTL_MS) return CACHE;

  const rows = await loadSheetRows();
  const tagsByRow = rows.map(rowToTags);

  const idsByTag = new Map();
  tagsByRow.forEach((tags, i) => {
    for (const t of tags) {
      if (!idsByTag.has(t)) idsByTag.set(t, new Set());
      idsByTag.get(t).add(i);
    }
  });

  const allTags = Array.from(idsByTag.keys()).sort((a, b) => a.localeCompare(b, "ja"));
  CACHE = { at: now, rows, tagsByRow, idsByTag, allTags };
  return CACHE;
}

function computeResultIds(mode, keywords, idsByTag, totalRows) {
  const ks = (keywords || []).filter(Boolean);
  if (ks.length === 0) return new Set(Array.from({ length: totalRows }, (_, i) => i));

  if (mode === "AND") {
    let cur = null;
    for (const k of ks) {
      const s = idsByTag.get(k) || new Set();
      cur = cur ? intersect(cur, s) : new Set(s);
      if (cur.size === 0) break;
    }
    return cur || new Set();
  }

  // OR
  let cur = new Set();
  for (const k of ks) {
    const s = idsByTag.get(k);
    if (s) cur = union(cur, s);
  }
  return cur;
}

function computeFacetCounts(mode, selected, baseIds, idsByTag, allTags) {
  const selectedSet = new Set(selected);
  const baseCount = baseIds.size;
  const out = {};

  for (const tag of allTags) {
    if (selectedSet.has(tag)) {
      out[tag] = baseCount;
      continue;
    }
    const tagIds = idsByTag.get(tag) || new Set();

    if (mode === "AND") {
      out[tag] = selected.length === 0 ? tagIds.size : intersect(baseIds, tagIds).size;
    } else {
      let add = 0;
      for (const v of tagIds) if (!baseIds.has(v)) add++;
      out[tag] = baseCount + add;
    }
  }
  return out;
}

/** ====== 公開API ====== */
export async function getFacets({ mode = "AND", keywords = [] }) {
  const idx = await getIndex();
  const baseIds = computeResultIds(mode, keywords, idx.idsByTag, idx.rows.length);
  const facets = computeFacetCounts(mode, keywords, baseIds, idx.idsByTag, idx.allTags);
  return { count: baseIds.size, facets };
}

export async function searchFlyers({ mode = "AND", keywords = [], page = 1, pageSize = 12 }) {
  const idx = await getIndex();
  const ids = computeResultIds(mode, keywords, idx.idsByTag, idx.rows.length);

  const all = Array.from(ids);
  const count = all.length;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  const slice = all.slice((p - 1) * pageSize, (p - 1) * pageSize + pageSize);

  const items = slice.map((rowId) => {
    const r = idx.rows[rowId];
    return {
      id: String(rowId),
      title: r.property_name || "(no title)",
      area: r.area,
      prefectures: r.prefectures,
      municipalities: r.municipalities,
      style: r.style,
      target: r.target,
      layout: r.layout,
      developer: r.developer,
      tags: idx.tagsByRow[rowId],
      // url列があるなら r.url を返す
      url: r.url,
    };
  });

  return { count, page: p, pageSize, totalPages, items };
}
