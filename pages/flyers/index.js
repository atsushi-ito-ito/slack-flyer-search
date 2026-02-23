// pages/flyers/index.js
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 12;

/** =========================
 *  1) 目的チップ（複数選択）
 *  - 各目的は「内部タグ群（OR）」として扱う
 *  - 複数目的は (A_OR) AND (B_OR) で交差
 * ========================= */
const PURPOSES = [
  {
    key: "価格・支払訴求",
    desc: "価格・月々支払で背中を押す",
    tags: ["価格", "価格表", "値下げ", "最終", "登録", "支払", "ローン"],
  },
  {
    key: "立地訴求",
    desc: "地図・アクセス・周辺環境など立地で納得",
    tags: ["地図", "アクセス", "ロケーション", "周辺環境", "ライフインフォメーション", "立地概念図", "駅近", "商業", "公園", "学校"],
  },
  {
    key: "品質訴求",
    desc: "設備・性能・構造など品質で安心",
    tags: ["設備", "設備仕様", "ZEH", "zeh", "免震", "構造", "セキュリティ", "casbee", "省エネ性能ラベル", "low-e", "第三者管理"],
  },
  {
    key: "魅力訴求",
    desc: "眺望・共用・室内など魅力で惹きつけ",
    tags: ["眺望", "夜景", "共用", "エントランス", "ロビー", "ラウンジ", "室内", "写真", "パース", "デザイン", "モデル"],
  },
  {
    key: "信頼訴求",
    desc: "実績・No.1・ランキングなどで信頼獲得",
    tags: ["実績", "ランキング", "No.1", "no.1", "成約", "成約事例", "供給", "オリコン", "顧客満足度"],
  },
  {
    key: "来場促進",
    desc: "来場予約・案内会・特典で行動を促す",
    tags: ["来場", "予約", "案内会", "見学", "相談", "オンライン相談", "キャンペーン", "特典", "プレゼント", "ノベルティ", "クオ", "商品券", "ギフト"],
  },
  {
    key: "完成後販売訴求",
    desc: "完成・竣工・棟内/実物で背中を押す",
    tags: ["完成", "竣工", "実物", "棟内", "建物内", "即入居", "竣工販売", "完成後販売", "完成物件"],
  },
  {
    key: "投資訴求",
    desc: "投資/収益/民泊など資産性で刺す",
    tags: ["投資", "収益", "民泊", "シミュレーション", "資産", "半投半住", "セミナー", "相続対策"],
  },
  {
    key: "ブランド訴求",
    desc: "ブランド・上質・世界観で惹きつけ",
    tags: ["ブランド", "高級感", "プレミアム", "上質", "限定", "コンセプト", "ブランドブック"],
  },
];

/** =========================
 *  2) 形（任意選択）
 * ========================= */
const FORMATS = [
  { key: "チラシ", desc: "一般的な販促チラシ" },
  { key: "dm", desc: "ダイレクトメール" },
  { key: "送付状", desc: "送付状/同封案内" },
  { key: "パンフ", desc: "パンフレット" },
  { key: "ミニパンフ", desc: "小冊子/簡易パンフ" },
  { key: "冊子", desc: "冊子形式" },
  { key: "価格表", desc: "価格表/価格訴求表" },
  { key: "map", desc: "マップ/案内図" },
];

/** =========================
 *  3) 仕様（任意選択）
 * ========================= */
const SPECS = [
  { key: "縦", desc: "縦向きレイアウト" },
  { key: "横", desc: "横向きレイアウト" },
  { key: "A4", desc: "A4サイズ" },
  { key: "B3", desc: "B3サイズ" },
  { key: "長A4", desc: "長A4" },
  { key: "ハガキ", desc: "はがき" },
  { key: "dm", desc: "DM" },
];

/** =========================
 *  4) 個別キーワード（カテゴリ分け）
 *  - まずは「迷わない」ための運用ベース分類
 *  - ここは運用で増やしてOK
 * ========================= */
const KEYWORD_CATEGORIES = [
  "すべて",
  "訴求",
  "ビジュアル",
  "イベント",
  "特典",
  "完成",
  "性能",
  "雰囲気",
  "投資",
  "その他",
];

const KEYWORDS = [
  // 訴求
  { key: "価格", cat: "訴求", desc: "価格訴求（価格帯/価格表など）" },
  { key: "支払", cat: "訴求", desc: "月々支払例の訴求" },
  { key: "返済", cat: "訴求", desc: "ローン返済例の訴求" },
  { key: "設備", cat: "訴求", desc: "設備仕様の紹介" },
  { key: "駅近", cat: "訴求", desc: "駅徒歩/駅近訴求" },
  { key: "眺望", cat: "訴求", desc: "眺望訴求" },
  { key: "周辺環境", cat: "訴求", desc: "周辺環境訴求" },
  { key: "アクセス", cat: "訴求", desc: "アクセス訴求" },
  { key: "地図", cat: "訴求", desc: "地図掲載（現地/ギャラリー案内等）" },
  { key: "ロケーション", cat: "訴求", desc: "ロケーション訴求" },

  // ビジュアル
  { key: "パース", cat: "ビジュアル", desc: "外観/内観パース掲載" },
  { key: "空撮", cat: "ビジュアル", desc: "空撮（鳥瞰含む）" },
  { key: "鳥瞰", cat: "ビジュアル", desc: "鳥瞰" },
  { key: "写真", cat: "ビジュアル", desc: "写真掲載（室内/外観など）" },
  { key: "室内", cat: "ビジュアル", desc: "室内写真/室内訴求" },
  { key: "イラスト", cat: "ビジュアル", desc: "イラスト" },

  // イベント
  { key: "来場", cat: "イベント", desc: "来場訴求" },
  { key: "予約", cat: "イベント", desc: "予約訴求" },
  { key: "案内会", cat: "イベント", desc: "案内会/事前案内会" },
  { key: "相談", cat: "イベント", desc: "相談会" },
  { key: "オンライン相談", cat: "イベント", desc: "オンライン相談" },
  { key: "FP", cat: "イベント", desc: "ファイナンシャルプランナー相談" },

  // 特典
  { key: "キャンペーン", cat: "特典", desc: "キャンペーン" },
  { key: "特典", cat: "特典", desc: "来場特典など" },
  { key: "プレゼント", cat: "特典", desc: "プレゼント" },
  { key: "ノベルティ", cat: "特典", desc: "ノベルティ" },
  { key: "クオ", cat: "特典", desc: "クオカードなど" },
  { key: "商品券", cat: "特典", desc: "商品券など" },

  // 完成
  { key: "竣工", cat: "完成", desc: "竣工" },
  { key: "完成", cat: "完成", desc: "完成" },
  { key: "実物", cat: "完成", desc: "実物/実物披露" },
  { key: "棟内", cat: "完成", desc: "棟内モデル/棟内見学" },
  { key: "即入居", cat: "完成", desc: "即入居可" },

  // 性能
  { key: "ZEH", cat: "性能", desc: "ZEH/ゼッチ" },
  { key: "zeh", cat: "性能", desc: "zeh表記" },
  { key: "免震", cat: "性能", desc: "免震" },
  { key: "casbee", cat: "性能", desc: "CASBEE" },
  { key: "省エネ性能ラベル", cat: "性能", desc: "省エネ性能ラベル" },

  // 雰囲気
  { key: "高級感", cat: "雰囲気", desc: "高級感" },
  { key: "シック", cat: "雰囲気", desc: "シック" },
  { key: "黒", cat: "雰囲気", desc: "黒基調" },
  { key: "金", cat: "雰囲気", desc: "金（ゴールド）" },
  { key: "パステル", cat: "雰囲気", desc: "パステル" },

  // 投資
  { key: "投資", cat: "投資", desc: "投資" },
  { key: "収益", cat: "投資", desc: "収益" },
  { key: "民泊", cat: "投資", desc: "民泊" },
  { key: "シミュレーション", cat: "投資", desc: "シミュレーション" },

  // その他
  { key: "ブランド", cat: "その他", desc: "ブランド" },
  { key: "限定", cat: "その他", desc: "限定" },
];

/** =========================
 *  API helpers
 * ========================= */
async function apiSearch({ mode, groups, page, pageSize }) {
  const res = await fetch("/api/flyers/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, groups, page, pageSize }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "search error");
  return data;
}

async function apiFacets({ mode, groups }) {
  const res = await fetch("/api/flyers/facets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, groups }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "facets error");
  return data;
}

/** =========================
 *  UI utils
 * ========================= */
function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

/** =========================
 *  groups builder
 *  - 目的：選択した目的ごとに group を作る（ORタグ群）→ 目的同士はAND交差
 *  - 形：選択があれば 1 group（OR）
 *  - 仕様：選択があれば 1 group（OR）
 *  - 個別KW：選択があれば 1 group（OR）
 * ========================= */
function buildGroups({ selectedPurposes, selectedFormats, selectedSpecs, selectedKeywords }) {
  const groups = [];

  // 目的（複数）→ 目的ごとに OR group を積む（ANDで交差）
  for (const pKey of selectedPurposes) {
    const p = PURPOSES.find((x) => x.key === pKey);
    if (!p) continue;
    const tags = uniq((p.tags || []).filter(Boolean));
    if (tags.length > 0) groups.push({ op: "OR", keywords: tags });
  }

  // 形（任意）
  if (selectedFormats.length > 0) groups.push({ op: "OR", keywords: uniq(selectedFormats) });

  // 仕様（任意）
  if (selectedSpecs.length > 0) groups.push({ op: "OR", keywords: uniq(selectedSpecs) });

  // 個別KW（任意）
  if (selectedKeywords.length > 0) groups.push({ op: "OR", keywords: uniq(selectedKeywords) });

  return groups;
}

/** =========================
 *  Preview count（個別KW用）
 *  - 表示中の個別キーワードだけ「追加したら何件？」を試算
 *  - 低負荷のため表示候補を最大 N 件に絞る
 * ========================= */
const PREVIEW_LIMIT = 36;
const PREVIEW_CONCURRENCY = 6;

async function runPool(tasks, concurrency) {
  let i = 0;
  const results = new Array(tasks.length);
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (i < tasks.length) {
      const cur = i++;
      results[cur] = await tasks[cur]();
    }
  });
  await Promise.all(workers);
  return results;
}

export default function FlyerSearchPage() {
  // modeは「グループ間は基本AND」なので UI上は固定ANDでOK。将来OR全体にしたいなら残せます。
  const [mode] = useState("AND");

  // 3階層
  const [selectedPurposes, setSelectedPurposes] = useState([]);
  const [selectedFormats, setSelectedFormats] = useState([]);
  const [selectedSpecs, setSelectedSpecs] = useState([]);

  // 個別KW（カテゴリ分け＋検索窓）
  const [kwCategory, setKwCategory] = useState("すべて");
  const [kwFilter, setKwFilter] = useState("");
  const [selectedKeywords, setSelectedKeywords] = useState([]);

  const selectedPurposeSet = useMemo(() => new Set(selectedPurposes), [selectedPurposes]);
  const selectedFormatSet = useMemo(() => new Set(selectedFormats), [selectedFormats]);
  const selectedSpecSet = useMemo(() => new Set(selectedSpecs), [selectedSpecs]);
  const selectedKeywordSet = useMemo(() => new Set(selectedKeywords), [selectedKeywords]);

  // groups
  const groups = useMemo(
    () =>
      buildGroups({
        selectedPurposes,
        selectedFormats,
        selectedSpecs,
        selectedKeywords,
      }),
    [selectedPurposes, selectedFormats, selectedSpecs, selectedKeywords]
  );

  // facets & counts
  const [count, setCount] = useState(0);
  const [facetsLoading, setFacetsLoading] = useState(false);

  // 個別KWの「追加したら何件？」（表示中だけ）
  const [kwPreview, setKwPreview] = useState({}); // { [keyword]: nextCount }
  const [kwPreviewLoading, setKwPreviewLoading] = useState(false);

  // details
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [notice, setNotice] = useState(null);

  // 表示する個別KW候補
  const visibleKeywords = useMemo(() => {
    const base = kwCategory === "すべて" ? KEYWORDS : KEYWORDS.filter((k) => k.cat === kwCategory);
    const q = kwFilter.trim();
    if (!q) return base;
    return base.filter((k) => k.key.includes(q) || (k.desc || "").includes(q));
  }, [kwCategory, kwFilter]);

  function toggle(arrSetter, arr, key) {
    arrSetter(arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key]);
  }

  function clearAll() {
    setNotice(null);
    setPage(1);
    setSelectedPurposes([]);
    setSelectedFormats([]);
    setSelectedSpecs([]);
    setSelectedKeywords([]);
  }

  // --- ① 件数（速い） ---
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setFacetsLoading(true);
      setNotice(null);
      try {
        const data = await apiFacets({ mode, groups });
        if (cancelled) return;
        setCount(data.count ?? 0);
      } catch (e) {
        if (cancelled) return;
        setCount(0);
        setNotice(`件数の取得に失敗しました：${String(e?.message || e)}`);
      } finally {
        if (!cancelled) setFacetsLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, groups]);

  // --- ② 一覧（ページング） ---
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setDetailsLoading(true);
      try {
        const data = await apiSearch({ mode, groups, page, pageSize: PAGE_SIZE });
        if (cancelled) return;
        setItems(data.items ?? []);
        setTotalPages(data.totalPages ?? 1);

        // 0件なら案内
        if ((data.count ?? 0) === 0) {
          setNotice("0件です。目的/形/仕様/キーワードを減らすか、条件を緩めてください。");
        }
      } catch (e) {
        if (cancelled) return;
        setItems([]);
        setTotalPages(1);
        setNotice(`一覧の取得に失敗しました：${String(e?.message || e)}`);
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, groups, page]);

  // --- ③ 個別KWの「追加したら何件？」プレビュー（表示中だけ） ---
  useEffect(() => {
    let cancelled = false;

    const candidates = visibleKeywords
      .map((k) => k.key)
      .filter((k) => !selectedKeywordSet.has(k))
      .slice(0, PREVIEW_LIMIT);

    // 候補が少なければ空に
    if (candidates.length === 0) {
      setKwPreview({});
      return;
    }

    const t = setTimeout(async () => {
      setKwPreviewLoading(true);

      // 現在選択中の個別KWに「候補k」を足した場合のcountを取りに行く
      const tasks = candidates.map((k) => async () => {
        const nextGroups = buildGroups({
          selectedPurposes,
          selectedFormats,
          selectedSpecs,
          selectedKeywords: [...selectedKeywords, k],
        });

        try {
          const data = await apiSearch({ mode, groups: nextGroups, page: 1, pageSize: 1 });
          return [k, data.count ?? 0];
        } catch {
          return [k, null];
        }
      });

      const pairs = await runPool(tasks, PREVIEW_CONCURRENCY);
      if (cancelled) return;

      const map = {};
      for (const [k, c] of pairs) if (typeof c === "number") map[k] = c;
      setKwPreview(map);
      setKwPreviewLoading(false);
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKeywords, selectedPurposes, selectedFormats, selectedSpecs, selectedKeywords]);

  // ---- chip click handlers ----
  function onPurposeClick(k) {
    setPage(1);
    toggle(setSelectedPurposes, selectedPurposes, k);
  }
  function onFormatClick(k) {
    setPage(1);
    toggle(setSelectedFormats, selectedFormats, k);
  }
  function onSpecClick(k) {
    setPage(1);
    toggle(setSelectedSpecs, selectedSpecs, k);
  }
  function onKeywordClick(k) {
    // 追加したら0件になる場合は注意（押せる）
    const nextCount = kwPreview?.[k];
    if (!selectedKeywordSet.has(k) && typeof nextCount === "number" && nextCount === 0) {
      setNotice(`「${k}」を追加すると 0件 になります（条件が厳しすぎる可能性）。`);
    }
    setPage(1);
    toggle(setSelectedKeywords, selectedKeywords, k);
  }

  const selectedSummary = useMemo(() => {
    const out = [];
    if (selectedPurposes.length) out.push(`目的：${selectedPurposes.join(" / ")}`);
    if (selectedFormats.length) out.push(`形：${selectedFormats.join(" / ")}`);
    if (selectedSpecs.length) out.push(`仕様：${selectedSpecs.join(" / ")}`);
    if (selectedKeywords.length) out.push(`KW：${selectedKeywords.join(" / ")}`);
    return out.join(" ｜ ");
  }, [selectedPurposes, selectedFormats, selectedSpecs, selectedKeywords]);

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="logo" />
          <div>
            <div className="sub">Flyer Search</div>
            <div className="title">フライヤーサーチ（Web）</div>
          </div>
        </div>

        <div className="controls">
          <div className="countBox">
            <div className="countLabel">ヒット件数</div>
            <div className="countVal">
              {count}
              <span className="countUnit">{facetsLoading ? " 更新中…" : " 件"}</span>
            </div>
          </div>

          <button className="clear" onClick={clearAll}>
            全クリア
          </button>
        </div>
      </header>

      <main className="grid">
        <aside className="panel">
          {notice && (
            <div className="notice">
              <div className="noticeText">{notice}</div>
              <div className="noticeActions">
                <button className="noticeBtn" onClick={clearAll}>
                  条件クリア
                </button>
              </div>
            </div>
          )}

          {selectedSummary && <div className="summary"> {selectedSummary} </div>}

          {/* 目的 */}
          <div className="section">
            <div className="label">① 目的（複数選択OK）</div>
            <div className="chips">
              {PURPOSES.map((p) => {
                const on = selectedPurposeSet.has(p.key);
                return (
                  <button
                    key={p.key}
                    className={cx("chip", on && "on")}
                    onClick={() => onPurposeClick(p.key)}
                    title={p.desc}
                  >
                    <span className="chipMain">{p.key}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 形 */}
          <div className="section">
            <div className="label">② 形（任意）</div>
            <div className="chips">
              {FORMATS.map((f) => {
                const on = selectedFormatSet.has(f.key);
                return (
                  <button
                    key={f.key}
                    className={cx("chip", on && "on")}
                    onClick={() => onFormatClick(f.key)}
                    title={f.desc}
                  >
                    <span className="chipMain">{f.key}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 仕様 */}
          <div className="section">
            <div className="label">③ 仕様（任意）</div>
            <div className="chips">
              {SPECS.map((s) => {
                const on = selectedSpecSet.has(s.key);
                return (
                  <button
                    key={s.key}
                    className={cx("chip", on && "on")}
                    onClick={() => onSpecClick(s.key)}
                    title={s.desc}
                  >
                    <span className="chipMain">{s.key}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 個別キーワード */}
          <div className="section">
            <div className="label">④ 個別キーワード（カテゴリで探す）</div>

            <div className="kwControls">
              <select className="select" value={kwCategory} onChange={(e) => setKwCategory(e.target.value)}>
                {KEYWORD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <input
                className="input"
                value={kwFilter}
                onChange={(e) => setKwFilter(e.target.value)}
                placeholder="キーワード検索（例：パース / 免震 / 竣工）"
              />
            </div>

            <div className="chips">
              {visibleKeywords.map((def) => {
                const on = selectedKeywordSet.has(def.key);
                const nextCount = kwPreview?.[def.key];
                const zero = !on && typeof nextCount === "number" && nextCount === 0;

                return (
                  <button
                    key={def.key}
                    className={cx("chip", on && "on", zero && "zero")}
                    onClick={() => onKeywordClick(def.key)}
                    title={def.desc || def.key}
                  >
                    <span className="chipMain">{def.key}</span>
                    {!on && typeof nextCount === "number" && <span className="badge">{nextCount}</span>}
                  </button>
                );
              })}
            </div>

            <div className="hint">
              ※バッジの数字は「その個別キーワードを追加した場合の件数」です（表示中の候補のみ試算）。
              {kwPreviewLoading && "（試算中…）"}
            </div>
          </div>
        </aside>

        <section className="result">
          <div className="resultTop">
            <div className="muted">{detailsLoading ? "読み込み中…" : `ページ ${page} / ${totalPages}`}</div>
            <div className="pager">
              <button className="pagerBtn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                前へ
              </button>
              <button
                className="pagerBtn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                次へ
              </button>
            </div>
          </div>

          <div className="cards">
            {items.map((f) => (
              <a key={f.id} href={f.url || "#"} target={f.url ? "_blank" : undefined} className="card">
                <div className="cardTitle">{f.title || "（名称未設定）"}</div>
                <div className="cardSub">{[f.prefectures, f.municipalities].filter(Boolean).join(" / ")}</div>
                <div className="cardMeta">{[f.style, f.layout, f.target, f.developer].filter(Boolean).join(" / ")}</div>
                {Array.isArray(f.tags) && f.tags.length > 0 && (
                  <div className="tags">
                    {f.tags.slice(0, 10).map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>

          {!detailsLoading && items.length === 0 && (
            <div className="empty">条件に一致するチラシがありません。条件を減らしてみてください。</div>
          )}
        </section>
      </main>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          background: radial-gradient(1200px 700px at 20% 0%, rgba(255,255,255,0.08), transparent 55%),
            radial-gradient(900px 600px at 90% 10%, rgba(255,255,255,0.06), transparent 55%), #0a0a0b;
          color: #f3f4f6;
        }
        .top {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
          background: rgba(10, 10, 11, 0.72);
        }
        .brand {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .logo {
          width: 38px;
          height: 38px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04));
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .sub {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.55);
        }
        .title {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }

        .controls {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .countBox {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }
        .countLabel {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.55);
        }
        .countVal {
          font-size: 20px;
          font-weight: 900;
        }
        .countUnit {
          font-size: 12px;
          margin-left: 6px;
          color: rgba(255, 255, 255, 0.55);
        }

        .clear {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.9);
          padding: 10px 12px;
          border-radius: 14px;
          cursor: pointer;
        }
        .clear:hover {
          background: rgba(255, 255, 255, 0.07);
        }

        .grid {
          max-width: 1180px;
          margin: 0 auto;
          padding: 18px 20px 26px;
          display: grid;
          grid-template-columns: 440px 1fr;
          gap: 16px;
        }
        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }

        .panel {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 24px;
          padding: 16px;
        }

        .notice {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          border-radius: 16px;
          padding: 10px 12px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.9);
        }
        .noticeActions {
          margin-top: 8px;
          display: flex;
          gap: 8px;
        }
        .noticeBtn {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.9);
          padding: 8px 10px;
          border-radius: 14px;
          cursor: pointer;
        }

        .summary {
          margin-top: 10px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(10, 10, 11, 0.25);
          border-radius: 14px;
          padding: 10px 12px;
        }

        .section {
          margin-top: 16px;
        }
        .label {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.62);
          font-weight: 700;
        }

        .chips {
          margin-top: 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chip {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.92);
          padding: 8px 10px;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          font-size: 13px;
          max-width: 100%;
        }
        .chip:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .chip.on {
          background: rgba(255, 255, 255, 0.92);
          color: #0a0a0b;
          border-color: rgba(255, 255, 255, 0.92);
        }
        .chip.zero {
          opacity: 0.42;
        }
        .chipMain {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 320px;
        }
        .badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: rgba(255, 255, 255, 0.75);
        }
        .chip.on .badge {
          border-color: rgba(0, 0, 0, 0.12);
          color: rgba(0, 0, 0, 0.65);
        }

        .kwControls {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 150px 1fr;
          gap: 10px;
          align-items: center;
        }
        .select,
        .input {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.9);
          padding: 10px 12px;
          border-radius: 14px;
          outline: none;
        }
        .input::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }

        .hint {
          margin-top: 10px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.45);
        }

        .result {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          border-radius: 24px;
          padding: 16px;
        }
        .resultTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .muted {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.55);
        }
        .pager {
          display: flex;
          gap: 8px;
        }
        .pagerBtn {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.9);
          padding: 8px 10px;
          border-radius: 14px;
          cursor: pointer;
        }
        .pagerBtn:disabled {
          opacity: 0.35;
          cursor: default;
        }

        .cards {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 980px) {
          .cards {
            grid-template-columns: 1fr;
          }
        }
        .card {
          display: block;
          text-decoration: none;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(10, 10, 11, 0.35);
          border-radius: 18px;
          padding: 14px;
          color: rgba(255, 255, 255, 0.92);
        }
        .card:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .cardTitle {
          font-weight: 800;
          font-size: 15px;
        }
        .cardSub {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
        }
        .cardMeta {
          margin-top: 6px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }

        .tags {
          margin-top: 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .tag {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.02);
          color: rgba(255, 255, 255, 0.75);
        }

        .empty {
          margin-top: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.02);
          border-radius: 18px;
          padding: 16px;
          color: rgba(255, 255, 255, 0.65);
        }
      `}</style>
    </div>
  );
}
