// pages/flyers/index.js
import { useEffect, useMemo, useState } from "react";
async function apiSearch({ mode, keywords, page, pageSize }) {
  const res = await fetch("/api/flyers/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, keywords, page, pageSize }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiFacets({ mode, keywords }) {
  const res = await fetch("/api/flyers/facets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, keywords }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


const PAGE_SIZE = 12;

// まずは「迷いが減る厳選セット」から開始（運用しながら追加推奨）
const KEYWORDS = [
  // 訴求
  { key: "価格", category: "訴求", desc: "価格訴求（価格帯/価格表など）" },
  { key: "支払", category: "訴求", desc: "月々支払例の訴求" },
  { key: "返済", category: "訴求", desc: "ローン返済例の訴求" },
  { key: "設備", category: "訴求", desc: "設備仕様の紹介" },
  { key: "地図", category: "訴求", desc: "地図掲載（現地/ギャラリー案内等）" },
  { key: "パース", category: "訴求", desc: "外観/内観パース掲載" },
  { key: "室内", category: "訴求", desc: "室内訴求（室内写真など）" },
  { key: "写真", category: "訴求", desc: "写真掲載（室内/外観など）" },
  { key: "駅近", category: "訴求", desc: "駅徒歩/駅近訴求" },
  { key: "高級感", category: "訴求", desc: "高級感訴求（上質/プレミアム等）" },
  { key: "シック", category: "訴求", desc: "シックなトーンの訴求" },

  // 種別（台帳の style に入っていそうなもの）
  { key: "チラシ", category: "種別", desc: "一般的な販促チラシ" },
  { key: "dm", category: "種別", desc: "ダイレクトメール" },
  { key: "送付状", category: "種別", desc: "送付状/同封案内" },
  { key: "パンフ", category: "種別", desc: "パンフレット" },
  { key: "ミニパンフ", category: "種別", desc: "小冊子/簡易パンフ" },
  { key: "冊子", category: "種別", desc: "冊子形式" },

  // 仕様（layout など）
  { key: "横", category: "仕様", desc: "横向きレイアウト" },
  { key: "縦", category: "仕様", desc: "縦向きレイアウト" },
  { key: "A4", category: "仕様", desc: "A4サイズ" },
  { key: "B3", category: "仕様", desc: "B3サイズ" },

  // まずはエリアは“よく使うものだけ”でOK（増やす）
  { key: "福岡", category: "エリア", desc: "福岡（prefectures/municipalities/area を横断）" },
  { key: "中央区", category: "エリア", desc: "福岡市中央区" },
  { key: "博多区", category: "エリア", desc: "福岡市博多区" },
];

const CATEGORIES = ["すべて", "エリア", "種別", "仕様", "訴求", "その他"];

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

export default function FlyerSearchPage() {
  const [mode, setMode] = useState("AND"); // AND/OR（Web側は切替）
  const [category, setCategory] = useState("すべて");

  const [selected, setSelected] = useState([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // facets（件数＆各キーワードの追加時件数）
  const [count, setCount] = useState(0);
  const [facets, setFacets] = useState({});
  const [facetsLoading, setFacetsLoading] = useState(false);

  // details（一覧）
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [notice, setNotice] = useState(null);

  const visibleKeywords = useMemo(() => {
    if (category === "すべて") return KEYWORDS;
    return KEYWORDS.filter((k) => k.category === category);
  }, [category]);

  function toggleKeyword(k) {
    setPage(1);
    setSelected((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  function clearAll() {
    setNotice(null);
    setPage(1);
    setSelected([]);
  }

  async function fetchFacets() {
    setFacetsLoading(true);
    try {
      const res = await fetch("/api/flyers/facets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, keywords: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "facets error");
      setCount(data.count ?? 0);
      setFacets(data.facets ?? {});
    } finally {
      setFacetsLoading(false);
    }
  }

  async function fetchDetails() {
    setDetailsLoading(true);
    try {
      const res = await fetch("/api/flyers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, keywords: selected, page, pageSize: PAGE_SIZE }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "search error");
      setItems(data.items ?? []);
      setTotalPages(data.totalPages ?? 1);
    } finally {
      setDetailsLoading(false);
    }
  }

  // ① facets → ② details（少しだけ遅らせて体感を良く）
  useEffect(() => {
    const t = setTimeout(async () => {
      setNotice(null);
      try {
        await fetchFacets();
      } catch (e) {
        setNotice(`件数の取得に失敗しました：${String(e?.message || e)}`);
        setCount(0);
        setFacets({});
      }
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        await fetchDetails();
      } catch (e) {
        setNotice(`一覧の取得に失敗しました：${String(e?.message || e)}`);
        setItems([]);
        setTotalPages(1);
      }
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected, page]);

  function onChipClick(k) {
    const nextCount = facets?.[k];
    if (!selectedSet.has(k) && typeof nextCount === "number" && nextCount === 0) {
      setNotice(`「${k}」を追加すると 0件 になります（条件が厳しすぎる可能性）。`);
      // それでも押せる要件なので止めない
    }
    toggleKeyword(k);
  }

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
          <div className="seg">
            <button className={cx("segBtn", mode === "AND" && "on")} onClick={() => setMode("AND")}>
              AND（すべて）
            </button>
            <button className={cx("segBtn", mode === "OR" && "on")} onClick={() => setMode("OR")}>
              OR（いずれか）
            </button>
          </div>

          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button className="clear" onClick={clearAll}>
            クリア
          </button>
        </div>
      </header>

      <main className="grid">
        <aside className="panel">
          <div className="countRow">
            <div>
              <div className="label">ヒット件数</div>
              <div className="count">
                {count}
                <span className="unit">{facetsLoading ? " 更新中…" : " 件"}</span>
              </div>
            </div>
            <div className="modeHint">{mode === "AND" ? "すべて含む" : "いずれか含む"}</div>
          </div>

          {notice && <div className="notice">{notice}</div>}

          <div className="section">
            <div className="label">選択中</div>
            <div className="chips">
              {selected.length === 0 ? (
                <div className="muted">未選択</div>
              ) : (
                selected.map((k) => (
                  <button key={k} className="chipSel" onClick={() => toggleKeyword(k)} title="クリックで解除">
                    {k} <span className="x">×</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="section">
            <div className="label">キーワード（押して絞り込み）</div>
            <div className="chips">
              {visibleKeywords.map((def) => {
                const on = selectedSet.has(def.key);
                const nextCount = facets?.[def.key];
                const zero = !on && typeof nextCount === "number" && nextCount === 0;

                return (
                  <button
                    key={def.key}
                    className={cx("chip", on && "on", zero && "zero")}
                    onClick={() => onChipClick(def.key)}
                    title={def.desc || def.key}
                  >
                    <span>{def.key}</span>
                    {!on && typeof nextCount === "number" && <span className="badge">{nextCount}</span>}
                  </button>
                );
              })}
            </div>
            <div className="hint">
              ※バッジの数字は「そのキーワードを追加した場合の件数」です（0ならグレーアウト）。
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
                <div className="cardSub">
                  {[f.prefectures, f.municipalities].filter(Boolean).join(" / ")}
                </div>
                <div className="cardMeta">
                  {[f.style, f.layout, f.target, f.developer].filter(Boolean).join(" / ")}
                </div>
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
            <div className="empty">
              条件に一致するチラシがありません。キーワードを減らすか、OR検索を試してください。
            </div>
          )}
        </section>
      </main>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          background: radial-gradient(1200px 700px at 20% 0%, rgba(255,255,255,0.08), transparent 55%),
                      radial-gradient(900px 600px at 90% 10%, rgba(255,255,255,0.06), transparent 55%),
                      #0a0a0b;
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
          border-bottom: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(10px);
          background: rgba(10,10,11,0.7);
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
          background: linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04));
          border: 1px solid rgba(255,255,255,0.12);
        }
        .sub { font-size: 12px; color: rgba(255,255,255,0.55); }
        .title { font-size: 16px; font-weight: 700; letter-spacing: 0.2px; }

        .controls { display: flex; gap: 10px; align-items: center; }
        .seg {
          display: flex;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          padding: 4px;
          border-radius: 16px;
        }
        .segBtn {
          border: 0;
          background: transparent;
          color: rgba(255,255,255,0.8);
          padding: 8px 10px;
          border-radius: 12px;
          cursor: pointer;
          font-size: 13px;
        }
        .segBtn.on {
          background: rgba(255,255,255,0.92);
          color: #0a0a0b;
        }
        .select {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.9);
          padding: 10px 12px;
          border-radius: 14px;
          outline: none;
        }
        .clear {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.9);
          padding: 10px 12px;
          border-radius: 14px;
          cursor: pointer;
        }
        .clear:hover { background: rgba(255,255,255,0.07); }

        .grid {
          max-width: 1180px;
          margin: 0 auto;
          padding: 18px 20px 26px;
          display: grid;
          grid-template-columns: 420px 1fr;
          gap: 16px;
        }
        @media (max-width: 980px) {
          .grid { grid-template-columns: 1fr; }
        }
        .panel {
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          border-radius: 24px;
          padding: 16px;
        }
        .countRow { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; }
        .label { font-size: 12px; color: rgba(255,255,255,0.55); }
        .count { font-size: 36px; font-weight: 800; letter-spacing: -0.5px; margin-top: 4px; }
        .unit { font-size: 12px; margin-left: 6px; color: rgba(255,255,255,0.55); }
        .modeHint { font-size: 13px; color: rgba(255,255,255,0.55); }

        .notice {
          margin-top: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.03);
          border-radius: 16px;
          padding: 10px 12px;
          font-size: 13px;
          color: rgba(255,255,255,0.85);
        }

        .section { margin-top: 16px; }
        .chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
        .muted { font-size: 13px; color: rgba(255,255,255,0.45); }

        .chipSel {
          border: 0;
          background: rgba(255,255,255,0.92);
          color: #0a0a0b;
          padding: 8px 10px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 13px;
        }
        .x { margin-left: 6px; opacity: 0.7; }

        .chip {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.90);
          padding: 8px 10px;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          font-size: 13px;
        }
        .chip:hover { background: rgba(255,255,255,0.06); }
        .chip.on {
          background: rgba(255,255,255,0.92);
          color: #0a0a0b;
          border-color: rgba(255,255,255,0.92);
        }
        .chip.zero { opacity: 0.42; }
        .badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          color: rgba(255,255,255,0.75);
        }
        .hint { margin-top: 10px; font-size: 12px; color: rgba(255,255,255,0.45); }

        .result {
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.03);
          border-radius: 24px;
          padding: 16px;
        }
        .resultTop { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .pager { display: flex; gap: 8px; }
        .pagerBtn {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.9);
          padding: 8px 10px;
          border-radius: 14px;
          cursor: pointer;
        }
        .pagerBtn:disabled { opacity: 0.35; cursor: default; }

        .cards { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (max-width: 980px) {
          .cards { grid-template-columns: 1fr; }
        }
        .card {
          display: block;
          text-decoration: none;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(10,10,11,0.35);
          border-radius: 18px;
          padding: 14px;
          color: rgba(255,255,255,0.92);
        }
        .card:hover { background: rgba(255,255,255,0.04); }
        .cardTitle { font-weight: 700; font-size: 15px; }
        .cardSub { margin-top: 6px; font-size: 13px; color: rgba(255,255,255,0.6); }
        .cardMeta { margin-top: 6px; font-size: 12px; color: rgba(255,255,255,0.5); }

        .tags { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
        .tag {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.02);
          color: rgba(255,255,255,0.75);
        }

        .empty {
          margin-top: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.02);
          border-radius: 18px;
          padding: 16px;
          color: rgba(255,255,255,0.65);
        }
      `}</style>
    </div>
  );
}
