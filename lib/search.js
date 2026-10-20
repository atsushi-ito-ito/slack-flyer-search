// 言葉 → 条件（チップ）への変換と、検索・並び替え・絞り込みの集計
// SYN_RAW：旧表記→統一タグの読み替え（キーワード整理 2026-10-20 の置き換え表）
import SYN_RAW from "./synonyms.json";

export const MOODS = [
  { key: "高級感", hint: "明朝・余白・3色以内", words: ["高級感", "高級", "上質", "プレミアム", "ラグジュアリー", "上品", "洗練"], tags: ["高級感", "プレミアム", "上質", "プレミアム."] },
  { key: "ナチュラル", hint: "緑・木・やわらかい写真", words: ["ナチュラル", "自然", "やさしい", "やわらか", "緑豊か"], tags: ["ナチュラル", "緑", "公園", "植栽"] },
  { key: "ポップ", hint: "多色・大きな数字・特典", words: ["ポップ", "にぎやか", "カジュアル", "明るい", "派手"], tags: ["ポップ", "イラスト", "パステル", "カラー"] },
  { key: "シンプル", hint: "白地・情報少なめ", words: ["シンプル", "すっきり", "ミニマル"], tags: ["シンプル", "白"] },
];

export const COLORS = [
  { key: "黒", hex: "#17181B", words: ["黒", "ブラック"], tags: ["黒", "主色：黒"] },
  { key: "白", hex: "#FFFFFF", words: ["白", "ホワイト"], tags: ["白", "主色：白"] },
  { key: "金", hex: "#B9A06B", words: ["金", "ゴールド"], tags: ["金", "ゴールド", "主色：金"] },
  { key: "青", hex: "#1E3A6E", words: ["青", "紺", "ネイビー", "ブルー"], tags: ["青", "紺", "ネイビー", "主色：青"] },
  { key: "緑", hex: "#4E6B4F", words: ["緑", "グリーン"], tags: ["緑", "主色：緑"] },
  { key: "赤", hex: "#B5322B", words: ["赤", "レッド"], tags: ["赤", "主色：赤"] },
  { key: "茶", hex: "#7A5A3E", words: ["茶", "ブラウン"], tags: ["茶色", "茶", "主色：茶"] },
];

export const PURPOSES = [
  { key: "来場促進", desc: "案内会・予約・来場特典", words: ["来場促進", "来場", "集客", "予約", "事前案内会", "案内会", "内覧会", "見学会", "説明会"], tags: ["来場", "予約", "案内会", "事前案内会", "見学", "相談", "来場特典", "事前案内", "案内", "事前", "ギャラリー案内"] },
  { key: "価格・支払", desc: "価格発表・月々支払例・値引き", words: ["価格", "支払", "返済", "月々", "値引き", "値下げ", "価格改定"], tags: ["価格", "価格表", "支払", "支払例", "返済", "返済例", "値引き", "値下げ", "価格発表", "管理費"] },
  { key: "立地", desc: "駅近・公園・周辺環境", words: ["立地", "駅近", "駅前", "周辺環境", "ロケーション", "アクセス"], tags: ["地図", "アクセス", "ロケーション", "周辺環境", "環境", "立地概念図", "駅近", "公園", "立地訴求", "立地概念"] },
  { key: "完成・即入居", desc: "竣工・実邸見学・最終期", words: ["完成", "竣工", "即入居", "実邸", "実物", "最終期", "最終", "完成後"], tags: ["完成", "竣工", "実物", "棟内", "即入居可", "竣工販売", "最終", "最終期", "ファイナル", "棟内モデル", "建物内", "完売"] },
  { key: "特典・キャンペーン", desc: "ノベルティ・抽選・商品券", words: ["特典", "キャンペーン", "ノベルティ", "プレゼント", "抽選", "商品券", "クオ"], tags: ["キャンペーン", "特典", "来場特典", "プレゼント", "ノベルティ", "クオ", "商品券", "抽選", "ギフト券", "アマゾン"] },
  { key: "ブランド", desc: "コンセプト・ブランドブック", words: ["ブランド", "コンセプト", "世界観"], tags: ["ブランド", "コンセプト", "ブランドブック", "コンセプトブック"] },
  { key: "品質・性能", desc: "設備・ZEH・構造", words: ["品質", "性能", "設備", "zeh", "省エネ", "免震", "構造"], tags: ["設備", "設備仕様", "zeh", "ZEH", "免震", "構造", "省エネ", "低炭素", "casbee", "オール電化", "iot"] },
  { key: "予告・新発表", desc: "予告広告・グランドオープン", words: ["予告", "新発表", "新登場", "グランドオープン", "オープン"], tags: ["予告", "予告広告", "新発表", "グランドオープン", "新登場", "オープン"] },
];

// 季節・節目（1年の流れ順）。key はタグの語彙と同じにする
export const SEASONS = [
  { key: "新春", label: "新春・お正月", words: ["新春", "お正月", "正月", "年始", "新年", "お年玉", "初売り"] },
  { key: "決算・年度末", label: "決算・年度末", words: ["決算", "年度末", "期末"] },
  { key: "春", label: "春・新生活", words: ["春", "新生活", "スプリング", "新年度", "入学", "桜"] },
  { key: "GW", label: "GW", words: ["gw", "ゴールデンウィーク", "ゴールデンウイーク"] },
  { key: "夏", label: "夏・お盆", words: ["夏", "サマー", "お盆", "夏休み"] },
  { key: "シルバーウィーク", label: "シルバーウィーク", words: ["シルバーウィーク", "シルバーウイーク"] },
  { key: "秋", label: "秋", words: ["秋", "オータム"] },
  { key: "年末", label: "年末", words: ["年末", "歳末", "年の瀬"] },
  { key: "クリスマス", label: "クリスマス", words: ["クリスマス", "xmas", "x'mas"] },
  { key: "冬", label: "冬", words: ["冬", "ウィンター"] },
];
export const SEASON_LABEL = Object.fromEntries(SEASONS.map((x) => [x.key, x.label]));

export const FORMATS = [
  { key: "DM", words: ["dm", "ダイレクトメール", "郵送", "はがき", "ハガキ"] },
  { key: "チラシ", words: ["チラシ", "ちらし", "フライヤー", "ペラ", "ポスティング"] },
  { key: "リターンツール", words: ["リターンツール", "資料請求"] },
];

// 資料の種類（ファイル名から拾う。冊子ありの資料はパンフレットにも数える）
export const DOCS = [
  { key: "DM", words: [] },
  { key: "はがき", words: ["はがき", "ハガキ", "招待状"] },
  { key: "チラシ", words: [] },
  { key: "送付状", words: ["送付状", "挨拶状", "ご挨拶"] },
  { key: "リターンツール", words: [] },
  { key: "パンフレット", words: ["パンフレット", "パンフ", "冊子", "ブランドブック", "コンセプトブック"] },
  { key: "ミニパンフ", words: ["ミニパンフレット", "ミニパンフ"] },
  { key: "価格表", words: ["価格表"] },
  { key: "間取り", words: ["間取り図", "図面集", "図面"] },
  { key: "その他", words: [] },
];
const DOC_RULES = [
  [/ミニパンフ/, "ミニパンフ"],
  [/パンフ|冊子|ブック|ブッ$/, "パンフレット"],
  [/(^|_)dm(_|$)|^dm/, "DM"],
  [/はがき|ハガキ|招待状/, "はがき"],
  [/チラシ|ペラ|リーフレット/, "チラシ"],
  [/送付状|挨拶/, "送付状"],
  [/リターンツー|^ツール/, "リターンツール"],
  [/価格/, "価格表"],
  [/間取|図面/, "間取り"],
];
const ROUTES = ["DM", "チラシ", "リターンツール"];
export function docKinds(item) {
  const name = nk(item.file).replace(/^\d+[.]/, "");
  const out = [];
  for (const [re, k] of DOC_RULES) if (re.test(name) && !out.includes(k)) { out.push(k); break; }
  // ファイル名が空欄の行は、入手経路（DM／チラシ／リターンツール）で代用する
  if (!out.length && !name && ["DM", "チラシ", "リターンツール"].includes(item.format)) out.push(item.format);
  if (!out.length) out.push("その他");
  if (item.booklet === "あり" && !out.includes("ミニパンフ") && !out.includes("パンフレット")) out.push("パンフレット");
  return out;
}

export const PRICES = ["〜5000", "5000-8000", "8000+", "不明"];
export const PRICE_LABEL = { "〜5000": "〜5000万", "5000-8000": "5000〜8000万", "8000+": "8000万〜", "不明": "不明" };
export const UNITS = ["〜30", "30-100", "100+"];
export const UNIT_LABEL = { "〜30": "〜30戸", "30-100": "30〜100戸", "100+": "100戸〜" };

export const KIND_LABEL = { mood: "雰囲気", color: "色", purpose: "目的", format: "入手経路", doc: "形式", pref: "エリア", city: "市区", price: "価格帯", units: "戸数", orient: "向き", season: "季節", text: "言葉" };

const nk = (s) => String(s || "").normalize("NFKC").toLowerCase();
const SYN = Object.fromEntries(Object.entries(SYN_RAW).map(([k, v]) => [nk(k), String(v).split(",").map(nk).filter(Boolean)]));

export const chipKey = (c) => `${c.kind}:${c.value}`;

// 文章を条件に変換する
export function parseQuery(q, items) {
  let rest = nk(q);
  const chips = [];
  const add = (kind, value) => {
    if (!chips.some((c) => c.kind === kind && c.value === value)) chips.push({ kind, value });
  };
  const take = (word) => {
    const w = nk(word);
    if (w && rest.includes(w)) { rest = rest.split(w).join(" "); return true; }
    return false;
  };

  // 価格（数字を含むので先に）
  const pm = rest.match(/(\d{4,5})\s*万(円)?(台|以上|以下|まで|前後)?/);
  if (pm) {
    const n = Number(pm[1]); const suf = pm[3] || "";
    if (suf === "以下" || suf === "まで" || n < 5000) add("price", "〜5000");
    else if (n >= 8000 || suf === "以上" && n >= 8000) add("price", "8000+");
    else add("price", "5000-8000");
    rest = rest.replace(pm[0], " ");
  }
  if (take("億")) add("price", "8000+");
  // 総戸数（例：100戸以上、30戸台）
  const um = rest.match(/(\d{1,4})\s*戸(以上|以下|未満|台|前後)?/);
  if (um) {
    const n = Number(um[1]); const suf = um[2] || "";
    if (n >= 100 && suf !== "以下" && suf !== "未満") add("units", "100+");
    else if ((n <= 30 && suf !== "以上") || suf === "以下" && n <= 30) add("units", "〜30");
    else add("units", "30-100");
    rest = rest.replace(um[0], " ");
  }

  // 地名（データにある市区・県から）
  const cities = Array.from(new Set(items.map((i) => i.city).filter(Boolean))).sort((a, b) => b.length - a.length);
  for (const c of cities) {
    const base = c.replace(/(市|区|町|郡)$/, "");
    if (take(c) || (base.length >= 2 && nk(c) !== nk(base) && rest.includes(nk(base + "市")) && take(base + "市"))) add("city", c);
  }
  const prefs = Array.from(new Set(items.map((i) => i.pref).filter(Boolean)));
  for (const p of prefs) {
    const base = p.replace(/(都|府|県)$/, "");
    if (take(p) || (base.length >= 2 && take(base))) add("pref", p);
  }

  for (const m of MOODS) for (const w of m.words) if (take(w)) add("mood", m.key);
  for (const p of PURPOSES) for (const w of [...p.words].sort((a, b) => b.length - a.length)) if (take(w)) add("purpose", p.key);
  for (const se of SEASONS) for (const w of [...se.words].sort((a, b) => b.length - a.length)) if (take(w)) add("season", se.key);
  DOCS.flatMap((d) => d.words.map((w) => [w, d.key])).sort((a, b) => b[0].length - a[0].length).forEach(([w, k]) => { if (take(w)) add("doc", k); });
  for (const f of FORMATS) for (const w of f.words) if (take(w)) add("doc", f.key);
  for (const c of COLORS) for (const w of c.words) if (take(w + "色") || take(w)) add("color", c.key);
  if (take("縦型") || take("縦長") || take("縦")) add("orient", "縦");
  if (take("横型") || take("横長") || take("横")) add("orient", "横");

  // 残りの言葉（助詞や汎用語は捨てる）
  const STOP = ["のある", "っぽい", "みたいな", "ような", "について", "に関する", "お知らせ", "ご案内", "案内", "訴求", "つき", "付き", "向け", "用の", "物件", "マンション", "分譲", "新築", "広告", "販促物", "資料", "デザイン", "感じ", "探す", "探したい", "系", "の", "な", "を", "で", "と", "が", "も", "に"];
  let r = rest;
  for (const s of STOP) r = r.split(s).join(" ");
  const ignored = [];
  r.split(/[\s　,、。・]+/).map((t) => t.trim()).filter((t) => t.length >= 2).forEach((t) => {
    // どの資料にも出てこない言葉は条件にしない（0件になるのを防ぐ）
    if (items.length && filterItems(items, [{ kind: "text", value: t }]).length === 0) ignored.push(t);
    else add("text", t);
  });
  chips.ignored = ignored;
  return chips;
}

function hasAny(tags, list) {
  const L = new Set(list.map(nk));
  return tags.some((t) => L.has(nk(t)));
}

function matchChip(item, c) {
  switch (c.kind) {
    case "mood": return hasAny(item.tags, MOODS.find((m) => m.key === c.value)?.tags || []) || (c.value === "高級感" && item.visual === "抽象・高級感");
    case "color": return hasAny(item.tags, COLORS.find((m) => m.key === c.value)?.tags || []);
    case "purpose": return hasAny(item.tags, PURPOSES.find((m) => m.key === c.value)?.tags || []);
    case "format": return item.format === c.value;
    // 形式：ファイル名から拾った種類。DM／チラシ／リターンツールは入手経路が同じものも含める
    case "doc": return docKinds(item).includes(c.value) || (ROUTES.includes(c.value) && item.format === c.value);
    case "pref": return item.pref === c.value;
    case "city": return item.city === c.value;
    case "price": return item.price === c.value;
    case "units": return item.units === c.value;
    case "orient": return item.orient === c.value;
    case "season": {
      const se = SEASONS.find((x) => x.key === c.value);
      if (!se) return false;
      if (hasAny(item.tags, [se.key])) return true;
      const ws = se.words.map(nk);
      return [item.incentives, item.file, ...(item.free || [])].some((x) => ws.some((w) => nk(x).includes(w)));
    }
    case "text": {
      const t = nk(c.value);
      const alts = [t, ...(SYN[t] || [])];
      const fields = [item.name, item.developer, item.city, item.pref, item.file, item.incentives, ...item.tags, ...(item.free || [])].map(nk);
      return alts.some((a) => fields.some((x) => x.includes(a)));
    }
    default: return true;
  }
}

// 同じ種類の条件はOR、違う種類はAND
export function filterItems(items, chips) {
  const groups = {};
  chips.forEach((c) => { (groups[c.kind] = groups[c.kind] || []).push(c); });
  const gs = Object.values(groups);
  return items.filter((it) => gs.every((g) => g.some((c) => matchChip(it, c))));
}

export function scoreItem(item, chips) {
  let s = 0;
  for (const c of chips) {
    if (c.kind === "purpose") s += item.tags.filter((t) => (PURPOSES.find((m) => m.key === c.value)?.tags || []).includes(t)).length;
    if (c.kind === "mood") s += item.tags.filter((t) => (MOODS.find((m) => m.key === c.value)?.tags || []).includes(t)).length + 1;
  }
  return s;
}

export function sortItems(list, chips, mode) {
  const arr = [...list];
  if (mode === "new") arr.sort((a, b) => b.row - a.row);
  else if (mode === "name") arr.sort((a, b) => a.name.localeCompare(b.name, "ja") || a.row - b.row);
  else arr.sort((a, b) => scoreItem(b, chips) - scoreItem(a, chips) || (b.thumb ? 1 : 0) - (a.thumb ? 1 : 0) || b.row - a.row);
  return arr;
}

export function facetCounts(list) {
  const count = (f) => { const m = {}; list.forEach((i) => { const v = f(i); if (v) m[v] = (m[v] || 0) + 1; }); return m; };
  return {
    format: count((i) => i.format),
    doc: (() => { const m = {}; list.forEach((i) => DOCS.forEach((d) => { if (matchChip(i, { kind: "doc", value: d.key })) m[d.key] = (m[d.key] || 0) + 1; })); return m; })(),
    price: count((i) => i.price),
    units: count((i) => i.units),
    orient: count((i) => i.orient),
    pref: count((i) => i.pref),
    season: (() => { const m = {}; list.forEach((i) => SEASONS.forEach((se) => { if (matchChip(i, { kind: "season", value: se.key })) m[se.key] = (m[se.key] || 0) + 1; })); return m; })(),
  };
}

export function similarItems(item, items, n = 6) {
  const T = new Set(item.tags.map(nk));
  const moodOf = (it) => MOODS.filter((m) => matchChip(it, { kind: "mood", value: m.key })).map((m) => m.key);
  const myMood = new Set(moodOf(item));
  return items
    .filter((x) => x.id !== item.id && x.name !== item.name)
    .map((x) => {
      const shared = x.tags.filter((t) => T.has(nk(t))).length;
      let s = shared / Math.max(1, Math.sqrt(T.size * Math.max(1, x.tags.length)));
      if (x.visual && x.visual === item.visual) s += 0.25;
      if (x.format === item.format) s += 0.15;
      if (x.pref === item.pref) s += 0.15;
      if (moodOf(x).some((m) => myMood.has(m))) s += 0.4;
      return { x, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((o) => o.x);
}

// サムネイル代わりの色（主色タグ → メイン画像の種類 → 既定）
export function toneOf(item) {
  for (const c of COLORS) if (hasAny(item.tags, c.tags)) return { bg: c.hex, fg: ["白", "金"].includes(c.key) ? "#15171B" : "#F2F1EC", border: c.key === "白" };
  const V = { "抽象・高級感": "#1C1D20", "外観": "#3A4A5C", "室内": "#7A6A56", "眺望": "#2F4F6F", "鳥瞰": "#45574A", "その他": "#6B6E75" };
  return { bg: V[item.visual] || "#8C9096", fg: "#F2F1EC", border: false };
}
