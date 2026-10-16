// 管理シート（Googleスプレッドシート）を読み込み、検索用に整形する
import { google } from "googleapis";
import fs from "fs";
import crypto from "crypto";
import THUMBS from "./thumbs.json";

const TTL_MS = 60 * 1000;
let CACHE = null;

const COLS = [
  "area", "prefectures", "municipalities", "property_name", "layout", "url", "updated",
  "keyword", "developer", "file_name", "stage", "price_range", "unit_count", "format",
  "has_booklet", "orientation", "floor_plan_display", "price_display", "visual_type",
  "pages_count", "included_items", "incentives",
];

function splitTags(s) {
  return String(s || "")
    .split(/[,、\n]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

// 旧表記の吸収（新しい統一語彙に寄せる）
const PRICE_MAP = { "5000-": "〜5000", "販売前": "不明", "": "不明" };

async function loadValues() {
  // ローカル確認用：CSVファイルから読む
  if (process.env.LOCAL_SAMPLE_CSV) {
    const text = fs.readFileSync(process.env.LOCAL_SAMPLE_CSV, "utf8");
    return parseCsv(text);
  }
  const sheetUrl = process.env.SHEET_URL;
  if (!sheetUrl) throw new Error("SHEET_URL が設定されていません");
  const m = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error("SHEET_URL の形式が正しくありません");
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
  if (!sa.client_email || !sa.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT が設定されていません");
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: String(sa.private_key).replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: m[1],
    range: process.env.SHEET_RANGE || "A:AA",
  });
  return res.data.values || [];
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function normalize(values) {
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h || "").trim());
  const idx = Object.fromEntries(COLS.map((c) => [c, headers.indexOf(c)]));
  const get = (r, c) => (idx[c] >= 0 ? String(r[idx[c]] ?? "").trim() : "");
  const items = [];
  const seen = new Set();
  values.slice(1).forEach((r, i) => {
    const name = get(r, "property_name");
    if (!name) return;
    const keyword = Array.from(new Set(splitTags(get(r, "keyword"))));
    const price = get(r, "price_range");
    const file = get(r, "file_name");
    const tkey = THUMBS[`${name}|${file}`];
    items.push({
      // 行の並べ替えで変わらないID（物件名＋ファイル名）
      id: (() => {
        let id = crypto.createHash("sha1").update(`${name}|${file}`).digest("hex").slice(0, 12);
        if (seen.has(id)) id = `${id}-${i + 2}`;
        seen.add(id);
        return id;
      })(),
      row: i + 2, // シートの行番号
      thumb: tkey ? `/thumbs/${tkey}.jpg` : "",
      area: get(r, "area") || (get(r, "prefectures") === "北海道" ? "北海道" : ""),
      pref: get(r, "prefectures"),
      city: get(r, "municipalities"),
      name,
      layout: get(r, "layout").toLowerCase(),
      url: get(r, "url"),
      tags: keyword,
      developer: get(r, "developer"),
      file,
      stage: get(r, "stage"),
      price: PRICE_MAP[price] ?? price,
      units: get(r, "unit_count"),
      format: get(r, "format"),
      booklet: get(r, "has_booklet"),
      orient: get(r, "orientation"),
      floor: get(r, "floor_plan_display"),
      priceDisp: get(r, "price_display"),
      visual: get(r, "visual_type"),
      pages: get(r, "pages_count"),
      incentives: get(r, "incentives"),
    });
  });
  return items;
}

export async function getItems() {
  const now = Date.now();
  if (CACHE && now - CACHE.at < TTL_MS) return CACHE;
  const items = normalize(await loadValues());
  CACHE = { at: now, items };
  return CACHE;
}
