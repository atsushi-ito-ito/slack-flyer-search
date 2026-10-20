import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MOODS, COLORS, PURPOSES, SEASONS, PRICES, PRICE_LABEL, UNITS, UNIT_LABEL, KIND_LABEL,
  parseQuery, filterItems, sortItems, facetCounts, similarItems, toneOf, chipKey,
} from "../lib/search";

const EXAMPLES = ["高級感のある来場促進DM 福岡", "大濠のDM", "価格改定のお知らせ", "特典つきキャンペーン", "完成後の即入居訴求"];
const PAGE = 40;
const BOARD_KEY = "flyerIndex.boards.v2";
// 列と重複する古いタグは表示しない
const DUP = new Set(["dm", "ｄｍ", "チラシ", "縦", "横", "リターンツール", "送付状", "ミニパンフ", "パンフ", "資料請求", "冊子", "ペラ"]);
const showTags = (tags) => tags.filter((t) => !DUP.has(String(t).toLowerCase()));

/* ---------- ボード（このブラウザに保存） ---------- */
function loadBoards() {
  try {
    const b = JSON.parse(localStorage.getItem(BOARD_KEY) || "null");
    if (b && Array.isArray(b.boards) && b.boards.length) return b;
  } catch (_) {}
  return { boards: [{ id: "b1", name: "参考ボード", items: [] }], current: "b1" };
}
function saveBoards(b) { try { localStorage.setItem(BOARD_KEY, JSON.stringify(b)); } catch (_) {} }

/* ---------- 小さな部品 ---------- */
function Thumb({ item, h, fit }) {
  const t = toneOf(item);
  const [tries, setTries] = useState(0); // 0=通常, 1=キャッシュ回避で再試行, 2=失敗
  const broken = tries >= 2;
  if (item.thumb && !broken) {
    const src = tries === 0 ? item.thumb : `${item.thumb}?r=${Date.now()}`;
    return (
      <div className="thumb img" style={fit ? { maxHeight: h } : { height: h || undefined }}>
        <img src={src} alt={`${item.name} ${item.file}`} loading="lazy" onError={() => setTries((n) => n + 1)}
          style={fit ? { maxHeight: h, width: "100%", objectFit: "contain" } : h ? { height: "100%", width: "100%", objectFit: "cover", objectPosition: "top" } : undefined} />
        <span className="fmt on-img">{item.format || "—"}</span>
      </div>
    );
  }
  const height = h || (item.orient === "縦" ? 280 : 180);
  return (
    <div className="thumb" style={{ height, background: t.bg, color: t.fg, border: t.border ? "1px solid var(--line)" : 0 }}>
      <div className="top">
        <span className="fmt">{item.format || "—"}</span>
        <span className="vis">{item.orient}{item.visual ? `・${item.visual}` : ""}</span>
      </div>
      <div className="bars"><div style={{ width: "62%", background: t.fg }} /><div style={{ width: "38%", background: t.fg }} /></div>
      {item.thumb && broken && <div className="thumb-err">画像を読み込めませんでした</div>}
    </div>
  );
}

function Card({ item, onOpen, pinned, onPin, onTag, compact }) {
  return (
    <article className="card">
      <button className="open" onClick={() => onOpen(item)} aria-label={`${item.name} ${item.file} を開く`}>
        <Thumb item={item} h={compact ? 130 : undefined} />
      </button>
      {onPin && (
        <button className={`pin${pinned ? " on" : ""}`} onClick={() => onPin(item)} aria-pressed={pinned}>
          {pinned ? "ボードに追加済み" : "＋ボード"}
        </button>
      )}
      <div className="info">
        <div className="nm">{item.name}</div>
        <div className="meta">{item.city || item.pref} ・ {item.file}</div>
        {!compact && (
          <div className="tags">
            {showTags(item.tags).slice(0, 4).map((t) => (
              <button key={t} className="tag" onClick={() => onTag && onTag(t)}>{t}</button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function Facet({ title, kind, keys, labels, counts, chips, toggle }) {
  const sel = new Set(chips.filter((c) => c.kind === kind).map((c) => c.value));
  const list = (keys || Object.keys(counts)).filter((k) => counts[k] || sel.has(k));
  if (!list.length) return null;
  return (
    <fieldset>
      <legend>{title}</legend>
      {list.map((k) => (
        <label key={k}>
          <input type="checkbox" checked={sel.has(k)} onChange={() => toggle({ kind, value: k })} />
          <span>{labels ? labels[k] || k : k}</span>
          <span className="n">{counts[k] || 0}</span>
        </label>
      ))}
    </fieldset>
  );
}

/* ---------- 画面本体 ---------- */
export default function Home() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("search");
  const [q, setQ] = useState("");
  const [chips, setChips] = useState([]);
  const [ignored, setIgnored] = useState([]);
  const [started, setStarted] = useState(false);
  const [sort, setSort] = useState("rel");
  const [layout, setLayout] = useState("grid");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(null);
  const [boards, setBoards] = useState(null);
  const inputRef = useRef(null);
  const loadedAt = useRef(0);

  // シートの最新内容を読み直す（開きっぱなしのタブでも古いタグが残らないように）
  const reloadItems = useCallback((fresh) => {
    return fetch(fresh ? `/api/items?t=${Date.now()}` : "/api/items", fresh ? { cache: "no-store" } : undefined)
      .then((r) => r.json()).then((d) => {
        if (d.error) throw new Error(d.error);
        loadedAt.current = Date.now();
        setItems(d.items);
        return d.items;
      });
  }, []);

  useEffect(() => {
    reloadItems(false).catch((e) => setError(String(e.message || e)));
    // タブに戻ってきたとき、前回の読み込みから2分以上たっていれば読み直す
    const onVis = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current > 2 * 60 * 1000) reloadItems(true).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    setBoards(loadBoards());
    // URLから検索条件を復元
    const p = new URLSearchParams(location.search);
    const c = p.get("c");
    if (c) {
      setChips(c.split("|").map((s) => { const i = s.indexOf(":"); return { kind: s.slice(0, i), value: s.slice(i + 1) }; }).filter((x) => x.kind && x.value));
      setStarted(true);
    }
    if (p.get("q")) setQ(p.get("q"));
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reloadItems]);

  useEffect(() => {
    if (!started) return;
    const p = new URLSearchParams();
    if (chips.length) p.set("c", chips.map(chipKey).join("|"));
    if (q) p.set("q", q);
    history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
  }, [chips, q, started]);

  useEffect(() => { if (boards) saveBoards(boards); }, [boards]);
  useEffect(() => { setLimit(PAGE); }, [chips, sort]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => (items ? sortItems(filterItems(items, chips), chips, sort) : []), [items, chips, sort]);
  const facets = useMemo(() => facetCounts(results), [results]);
  const propCount = useMemo(() => new Set(results.map((r) => r.name)).size, [results]);

  // 次の絞り込みの提案（件数が多いときだけ）
  const suggestions = useMemo(() => {
    if (!items || results.length < 12) return [];
    const out = [];
    const has = (k) => chips.some((c) => c.kind === k);
    if (!has("format")) {
      const [k, n] = Object.entries(facets.format).sort((a, b) => a[1] - b[1]).find(([, n]) => n >= 3) || [];
      if (k && n < results.length) out.push({ chip: { kind: "format", value: k }, label: `${k}だけにする（${n}件）` });
    }
    if (!has("pref") && !has("city")) {
      const [k, n] = Object.entries(facets.pref).sort((a, b) => b[1] - a[1])[0] || [];
      if (k && n < results.length) out.push({ chip: { kind: "pref", value: k }, label: `${k}だけにする（${n}件）` });
    }
    return out;
  }, [items, results, facets, chips]);

  const toggle = (c) => {
    setStarted(true);
    setChips((cs) => (cs.some((x) => chipKey(x) === chipKey(c)) ? cs.filter((x) => chipKey(x) !== chipKey(c)) : [...cs, c]));
  };
  const setOnly = (c) => { setIgnored([]); setStarted(true); setView("search"); setOpen(null); setQ(""); setChips([c]); window.scrollTo(0, 0); };
  const submit = (text) => {
    const t = text ?? q;
    setStarted(true); setView("search");
    const parsed = t.trim() ? parseQuery(t, items || []) : [];
    setIgnored(parsed.ignored || []);
    setChips([...parsed]);
    if (text !== undefined) setQ(text);
  };
  const reset = () => { setChips([]); setQ(""); setStarted(false); setView("search"); history.replaceState(null, "", location.pathname); };

  const board = boards?.boards.find((b) => b.id === boards.current) || boards?.boards[0];
  const pinned = (it) => !!board?.items.some((x) => x.id === it.id);
  const pin = (it) => setBoards((B) => ({
    ...B,
    boards: B.boards.map((b) => (b.id !== B.current ? b : {
      ...b, items: b.items.some((x) => x.id === it.id) ? b.items.filter((x) => x.id !== it.id) : [...b.items, { id: it.id, note: "" }],
    })),
  }));
  const byId = useMemo(() => Object.fromEntries((items || []).map((i) => [i.id, i])), [items]);
  const showHome = view === "search" && !started;

  return (
    <>
      <header className="hdr">
        <div className="wrap">
          <button className="logo" onClick={reset}>FLYER INDEX<small>他社販促物ライブラリ</small></button>
          {!showHome && view === "search" && (
            <form className="search sm" role="search" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <label htmlFor="q2" className="sr">検索</label>
              <input id="q2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：高級感のある来場促進DM 福岡" />
              <button type="submit">探す</button>
            </form>
          )}
          <span className="spacer" />
          <nav className="nav" aria-label="メイン">
            <button aria-current={view === "search" ? "page" : undefined} onClick={() => setView("search")}>探す</button>
            <button aria-current={view === "board" ? "page" : undefined} onClick={() => setView("board")}>
              ボード{board?.items.length ? <span className="badge">{board.items.length}</span> : null}
            </button>
          </nav>
          <span className="muted" style={{ fontSize: 13 }}>{items ? `${items.length}件 ／ ${new Set(items.map((i) => i.name)).size}物件` : "読み込み中…"}</span>
        </div>
      </header>

      <main className="wrap">
        {error && <div className="err">データを読み込めませんでした：{error}</div>}

        {showHome && (
          <>
            <section className="hero">
              <h1 className="mincho">探したい雰囲気を、<br />そのまま言葉に。</h1>
              <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <label htmlFor="q" className="sr">検索</label>
                <input id="q" ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：高級感のある来場促進DM　福岡市　5000万円台" autoFocus />
                <button type="submit">探す</button>
              </form>
              <div className="examples">
                <span className="muted" style={{ fontSize: 13 }}>例</span>
                {EXAMPLES.map((ex) => <button key={ex} className="pill" onClick={() => submit(ex)}>{ex}</button>)}
              </div>
            </section>

            <section className="sec" aria-labelledby="h-mood">
              <h2 id="h-mood">雰囲気から探す <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>　言葉にしにくいときは見た目で</span></h2>
              <div className="moods">
                <button className="mood" onClick={() => setOnly({ kind: "mood", value: "高級感" })}>
                  <div className="art" style={{ background: "#17181B" }}><div style={{ width: 1, height: 110, background: "#B9A06B" }} /><div className="mincho" style={{ writingMode: "vertical-rl", fontSize: 24, letterSpacing: ".3em", color: "#D8C394" }}>静けさを纏う</div></div>
                  <div className="lbl"><b>高級感</b><span className="muted" style={{ fontSize: 13 }}>{MOODS[0].hint}</span></div>
                </button>
                <button className="mood" onClick={() => setOnly({ kind: "mood", value: "ナチュラル" })}>
                  <div className="art" style={{ background: "#E3E0D2", alignItems: "flex-end", justifyContent: "flex-start", padding: 22 }}><div style={{ width: 80, height: 80, borderRadius: "50%", background: "#7D8B6A" }} /><div style={{ width: 48, height: 124, borderRadius: 24, background: "#B6A98A", marginLeft: -10 }} /></div>
                  <div className="lbl"><b>ナチュラル</b><span className="muted" style={{ fontSize: 13 }}>{MOODS[1].hint}</span></div>
                </button>
                <button className="mood" onClick={() => setOnly({ kind: "mood", value: "ポップ" })}>
                  <div className="art" style={{ background: "#FFD84D", gap: 0 }}><div style={{ width: 100, height: 100, borderRadius: "50%", background: "#F2624B" }} /><div style={{ width: 64, height: 64, background: "#2B4FD8", marginLeft: -22, marginTop: 56 }} /></div>
                  <div className="lbl"><b>ポップ</b><span className="muted" style={{ fontSize: 13 }}>{MOODS[2].hint}</span></div>
                </button>
                <button className="mood" onClick={() => setOnly({ kind: "mood", value: "シンプル" })}>
                  <div className="art" style={{ background: "#fff", border: "1px solid var(--line)", flexDirection: "column", alignItems: "stretch", padding: "0 36px", gap: 12 }}><div style={{ height: 2, background: "#15171B" }} /><div style={{ height: 2, width: "60%", background: "#15171B" }} /><div style={{ width: 26, height: 26, background: "#15171B" }} /></div>
                  <div className="lbl"><b>シンプル</b><span className="muted" style={{ fontSize: 13 }}>{MOODS[3].hint}</span></div>
                </button>
              </div>
            </section>

            <div className="row2">
              <section className="sec" aria-labelledby="h-col" style={{ flex: "1 1 340px" }}>
                <h2 id="h-col">主な色で探す</h2>
                <div className="swatches">
                  {COLORS.map((c) => (
                    <button key={c.key} className="sw" onClick={() => setOnly({ kind: "color", value: c.key })} aria-label={`主色 ${c.key}`}>
                      <span style={{ background: c.hex }} />{c.key}
                    </button>
                  ))}
                </div>
              </section>
              <section className="sec" aria-labelledby="h-pur" style={{ flex: "2 1 640px" }}>
                <h2 id="h-pur">目的から探す</h2>
                <div className="purposes">
                  {PURPOSES.map((p) => (
                    <button key={p.key} className="purpose" onClick={() => setOnly({ kind: "purpose", value: p.key })}><b>{p.key}</b><span>{p.desc}</span></button>
                  ))}
                </div>
              </section>
            </div>

            {items && (
              <section className="sec" aria-labelledby="h-new" style={{ paddingBottom: 64 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <h2 id="h-new">最近追加された資料</h2>
                  <button className="link" onClick={() => { setStarted(true); setSort("new"); setChips([]); }}>すべて見る</button>
                </div>
                <div className="simgrid">
                  {[...items].sort((a, b) => b.row - a.row).slice(0, 6).map((it) => (
                    <Card key={it.id} item={it} onOpen={setOpen} compact />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!showHome && view === "search" && (
          <>
            <div className="interp" aria-live="polite">
              <span className="muted" style={{ fontSize: 13 }}>{q && chips.length ? "こう解釈しました" : "条件"}</span>
              {chips.map((c) => (
                <button key={chipKey(c)} className="chip" onClick={() => toggle(c)} aria-label={`${KIND_LABEL[c.kind]} ${c.value} を外す`}>
                  <small>{KIND_LABEL[c.kind]}</small>{c.kind === "price" ? PRICE_LABEL[c.value] : c.kind === "units" ? UNIT_LABEL[c.value] : c.value}<span aria-hidden="true">×</span>
                </button>
              ))}
              {!chips.length && <span className="muted" style={{ fontSize: 14 }}>なし（すべての資料）</span>}
              {chips.length > 0 && <button className="link" onClick={() => setChips([])}>すべて外す</button>}
              {ignored.length > 0 && <span className="muted" style={{ fontSize: 13 }}>（「{ignored.join("」「")}」は該当する資料がないため条件から外しました）</span>}
              <span className="spacer" />
              {suggestions.length > 0 && <span className="muted" style={{ fontSize: 13 }}>提案：</span>}
              {suggestions.map((s) => <button key={s.label} className="chip sug" onClick={() => toggle(s.chip)}>{s.label}</button>)}
            </div>

            <div className="layout">
              <aside className="side" aria-label="絞り込み">
                <Facet title="形式" kind="format" counts={facets.format} chips={chips} toggle={toggle} keys={["DM", "チラシ", "リターンツール"]} />
                <Facet title="価格帯" kind="price" counts={facets.price} chips={chips} toggle={toggle} keys={PRICES} labels={PRICE_LABEL} />
                <Facet title="総戸数" kind="units" counts={facets.units} chips={chips} toggle={toggle} keys={UNITS} labels={UNIT_LABEL} />
                <Facet title="向き" kind="orient" counts={facets.orient} chips={chips} toggle={toggle} keys={["縦", "横"]} />
                <Facet title="季節" kind="season" counts={facets.season} chips={chips} toggle={toggle} keys={SEASONS.map((x) => x.key)} />
                <Facet title="エリア" kind="pref" counts={facets.pref} chips={chips} toggle={toggle} />
                <fieldset>
                  <legend>雰囲気</legend>
                  {MOODS.map((m) => (
                    <label key={m.key}><input type="checkbox" checked={chips.some((c) => c.kind === "mood" && c.value === m.key)} onChange={() => toggle({ kind: "mood", value: m.key })} /><span>{m.key}</span></label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>主な色</legend>
                  <div className="swatches" style={{ gap: 8 }}>
                    {COLORS.map((c) => {
                      const on = chips.some((x) => x.kind === "color" && x.value === c.key);
                      return <button key={c.key} className="sw" onClick={() => toggle({ kind: "color", value: c.key })} aria-pressed={on} aria-label={c.key}><span style={{ width: 30, height: 30, background: c.hex, outline: on ? "2px solid var(--accent)" : 0, outlineOffset: 2 }} /></button>;
                    })}
                  </div>
                </fieldset>
              </aside>

              <section className="main" aria-label="検索結果">
                <div className="toolbar">
                  <div className="count"><span className="big mincho">{items ? results.length : "…"}</span><span>件</span><span className="muted" style={{ fontSize: 13 }}>{propCount}物件</span></div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                    <label htmlFor="sort" className="muted" style={{ fontSize: 14 }}>並び</label>
                    <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                      <option value="rel">条件に近い順</option><option value="new">追加が新しい順</option><option value="name">物件名順</option>
                    </select>
                    <div className="seg" role="group" aria-label="表示切替">
                      <button aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>サムネイル</button>
                      <button aria-pressed={layout === "table"} onClick={() => setLayout("table")}>一覧表</button>
                    </div>
                  </div>
                </div>

                {items && results.length === 0 && (
                  <div className="empty">条件に合う資料がありません。上の条件を1つ外してみてください。</div>
                )}

                {layout === "grid" ? (
                  <div className="grid">
                    {results.slice(0, limit).map((it) => (
                      <Card key={it.id} item={it} onOpen={setOpen} pinned={pinned(it)} onPin={pin} onTag={(t) => toggle({ kind: "text", value: t })} />
                    ))}
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead><tr><th>物件名</th><th>資料</th><th>形式</th><th>エリア</th><th>価格帯</th><th>向き</th><th>タグ</th></tr></thead>
                      <tbody>
                        {results.slice(0, limit).map((it) => (
                          <tr key={it.id} onClick={() => setOpen(it)}>
                            <td><button className="link" style={{ padding: 0, color: "var(--ink)", fontWeight: 700, textAlign: "left" }} onClick={() => setOpen(it)}>{it.name}</button></td>
                            <td>{it.file}</td><td>{it.format}</td><td>{it.pref} {it.city}</td><td>{PRICE_LABEL[it.price] || it.price}</td><td>{it.orient}</td>
                            <td className="muted">{showTags(it.tags).slice(0, 6).join("、")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {results.length > limit && <button className="more" onClick={() => setLimit((l) => l + PAGE)}>さらに表示（残り{results.length - limit}件）</button>}
              </section>
            </div>
          </>
        )}

        {view === "board" && boards && (
          <BoardView boards={boards} setBoards={setBoards} byId={byId} reload={() => reloadItems(true)} onOpen={setOpen} goSearch={() => setView("search")} />
        )}
      </main>

      {open && (
        <Detail item={open} items={items || []} onClose={() => setOpen(null)} onOpen={setOpen} pinned={pinned(open)} onPin={pin} onTag={(t) => setOnly({ kind: "text", value: t })} />
      )}
    </>
  );
}

function Detail({ item, items, onClose, onOpen, pinned, onPin, onTag }) {
  const sim = useMemo(() => similarItems(item, items, 6), [item, items]);
  const same = useMemo(() => items.filter((x) => x.name === item.name && x.id !== item.id), [item, items]);
  const A = [
    ["形式（入手経路）", item.format], ["時期", item.stage], ["価格帯", PRICE_LABEL[item.price] || item.price], ["総戸数", UNIT_LABEL[item.units] || item.units],
    ["向き", item.orient], ["間取り掲載", item.floor], ["価格表示", item.priceDisp], ["メイン画像", item.visual],
    ["冊子", item.booklet], ["特典", item.incentives], ["売主", item.developer], ["間取り", item.layout],
  ].filter(([, v]) => v);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel" role="dialog" aria-modal="true" aria-labelledby="dt">
        <div className="head">
          <div>
            <div className="muted" style={{ fontSize: 13 }}>{[item.area, item.pref, item.city].filter(Boolean).join(" › ")}</div>
            <h2 id="dt" className="mincho" style={{ margin: "4px 0 0", fontSize: 26, lineHeight: 1.4 }}>{item.name}</h2>
            <div style={{ fontSize: 14 }}>{item.file}{item.developer ? ` ・ ${item.developer}` : ""}<span className="muted">　シート{item.row}行目</span></div>
          </div>
          <button className="x" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <div className="dgrid">
          <div className="dprev">
            {item.thumb ? (
              <a href={item.url || item.thumb} target="_blank" rel="noreferrer" title={item.url ? "PDFを開く" : "画像を開く"}><Thumb item={item} h={620} fit /></a>
            ) : <Thumb item={item} h={item.orient === "縦" ? 460 : 280} />}
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>1ページ目</div>
          </div>
          <div className="dinfo">
            <div className="btns">
              {item.url ? <a className="btn pri" href={item.url} target="_blank" rel="noreferrer">PDFを開く</a> : <span className="btn dis">共有リンク未登録</span>}
              <button className="btn sec" onClick={() => onPin(item)}>{pinned ? "ボードから外す" : "ボードに追加"}</button>
            </div>
            <dl className="attrs">{A.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            {showTags(item.tags).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="muted" style={{ fontSize: 13, fontWeight: 700 }}>タグ（押すとそのタグで検索）</div>
                <div className="tags">{showTags(item.tags).map((t) => <button key={t} className="tag" style={{ fontSize: 13, padding: "3px 10px" }} onClick={() => onTag(t)}>{t}</button>)}</div>
              </div>
            )}
          </div>
        </div>
        {same.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>同じ物件の資料（{same.length}件）</h3>
            <div className="simgrid">{same.slice(0, 12).map((x) => <Card key={x.id} item={x} onOpen={onOpen} compact />)}</div>
          </section>
        )}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>雰囲気が近い資料</h3>
          <div className="simgrid">{sim.map((x) => <Card key={x.id} item={x} onOpen={onOpen} compact />)}</div>
        </section>
      </div>
    </div>
  );
}

function commonTags(list) {
  const m = {};
  list.forEach(({ item }) => item.tags.forEach((t) => { m[t] = (m[t] || 0) + 1; }));
  return Object.entries(m).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function BoardView({ boards, setBoards, byId, reload, onOpen, goSearch }) {
  const cur = boards.boards.find((b) => b.id === boards.current) || boards.boards[0];
  const upd = (fn) => setBoards((B) => ({ ...B, boards: B.boards.map((b) => (b.id === cur.id ? fn(b) : b)) }));
  const add = () => {
    const name = prompt("新しいボードの名前（例：〇〇物件 年末DM）");
    if (!name) return;
    const id = "b" + Date.now();
    setBoards((B) => ({ boards: [...B.boards, { id, name, items: [] }], current: id }));
  };
  const rename = () => { const name = prompt("ボード名", cur.name); if (name) upd((b) => ({ ...b, name })); };
  const del = () => {
    if (boards.boards.length < 2 || !confirm(`「${cur.name}」を削除しますか？（資料そのものは消えません）`)) return;
    setBoards((B) => { const rest = B.boards.filter((b) => b.id !== cur.id); return { boards: rest, current: rest[0].id }; });
  };
  const its = cur.items.map((x) => ({ ...x, item: byId[x.id] })).filter((x) => x.item);
  const common = useMemo(() => commonTags(its), [its]);
  const copyList = () => {
    const text = `【${cur.name}】\n` + its.map(({ item, note }) => `・${item.name} ${item.file}${note ? `｜${note}` : ""}${item.url ? `\n  ${item.url}` : ""}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => alert("一覧をコピーしました。チャットやメールに貼り付けて共有できます。"));
  };
  const brief = cur.brief || {};
  const setBrief = (k, v) => upd((b) => ({ ...b, brief: { ...(b.brief || {}), [k]: v } }));
  const copyBrief = async () => {
    // コピーの直前にシートの最新内容を読み直し、今のタグで依頼文を作る
    let its = cur.items.map((x) => ({ ...x, item: byId[x.id] })).filter((x) => x.item);
    try {
      const fresh = await reload();
      const map = Object.fromEntries(fresh.map((i) => [i.id, i]));
      its = cur.items.map((x) => ({ ...x, item: map[x.id] })).filter((x) => x.item);
    } catch (_) { /* 読み直せなければ表示中の内容で作る */ }
    const common = commonTags(its);
    const lines = [
      "他社販促物データベース（slack-flyer-search）の資料を参考に、DMの構成案とデザインのたたき台を作ってください。",
      "",
      "■ 作るDM",
      `・物件の概要：${brief.property || "（未記入）"}`,
      `・DMの目的：${brief.purpose || "（未記入）"}`,
      `・判型：${brief.size || "（未記入）"}`,
      `・トーン・その他の要望：${brief.memo || "（なし）"}`,
      "",
      `■ 参考にする資料（ボード「${cur.name}」${its.length}件）`,
      ...its.map(({ item, note }, i) => `${i + 1}. ${item.name}（${item.pref}${item.city}）${item.file}｜シート${item.row}行目｜${item.format || "-"}・${item.orient || "-"}｜タグ：${item.tags.slice(0, 8).join("、")}${note ? `\n   参考にしたい点：${note}` : ""}`),
      common.length ? `\n■ 共通するタグ：${common.map(([t, n]) => `${t}(${n})`).join("、")}` : "",
      "",
      "■ 進め方",
      "1. 上の資料のPDFを読み、面ごとの構成・コピーの型・写真の使い方・特典と来場導線の見せ方を比較表にまとめる",
      "2. 面ごとの台割と見出し・コピー案（2〜3案）を作る。どの資料のどこを手本にしたかも書く",
      "3. デザインのたたき台をデザインのキャンバスで作る",
      "",
      "■ 仮置きのルール（物件の概要に書いていない情報）",
      "・数字はすべて0で置く（例：徒歩0分、平置き駐車場000％、0,000万円〜、月々0万円台〜、第0期）",
      "・電話番号は0120-000-000、面積は00.00㎡と書く",
      "・物件名・駅名・特典内容などの文字は［物件名］のように［］で置く",
    ].filter((l) => l !== undefined);
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      alert("構成案の依頼文をコピーしました（タグはシートの最新内容です）。Claudeのチャットに貼り付けて送ってください。");
    } catch (_) {
      prompt("自動でコピーできなかったので、下の文を全選択してコピーしてください。", text);
    }
  };
  return (
    <div className="bwrap">
      <nav className="blist" aria-label="ボード一覧">
        <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>マイボード（このPCに保存）</div>
        {boards.boards.map((b) => (
          <button key={b.id} aria-current={b.id === cur.id} onClick={() => setBoards((B) => ({ ...B, current: b.id }))}>{b.name} <span className="muted">{b.items.length}</span></button>
        ))}
        <button onClick={add} style={{ border: "1px dashed #8C8F96", marginTop: 6 }}>＋ 新しいボード</button>
      </nav>
      <section className="bmain" aria-labelledby="bt">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 id="bt" className="mincho" style={{ margin: 0, fontSize: 28 }}>{cur.name}</h1>
            <span className="muted" style={{ fontSize: 13 }}>{its.length}件</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="link" onClick={rename}>名前を変更</button>
            {boards.boards.length > 1 && <button className="link" onClick={del}>ボードを削除</button>}
          </div>
        </div>
        {its.length === 0 ? (
          <div className="empty">まだ資料がありません。<button className="link" onClick={goSearch}>探す画面</button>で「＋ボード」を押すと、ここに集まります。</div>
        ) : (
          <div className="bgrid">
            {its.map(({ item, note }) => (
              <article key={item.id} className="bcard">
                <button className="open" style={{ border: 0, padding: 0, background: "none" }} onClick={() => onOpen(item)} aria-label={`${item.name} の詳細`}><Thumb item={item} h={160} /></button>
                <div className="body">
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.4 }}>{item.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{item.file}</div>
                  <label className="muted" style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>参考にしたい点
                    <input value={note} onChange={(e) => upd((b) => ({ ...b, items: b.items.map((x) => (x.id === item.id ? { ...x, note: e.target.value } : x)) }))} placeholder="例：縦書きコピーの余白" />
                  </label>
                  <button className="rm" onClick={() => upd((b) => ({ ...b, items: b.items.filter((x) => x.id !== item.id) }))}>ボードから外す</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <aside className="bside" aria-label="このボードの共通点">
        <b>このボードの共通点</b>
        {common.length ? <ul>{common.map(([t, n]) => <li key={t}>{t}（{n}件）</li>)}</ul> : <span style={{ opacity: .8 }}>2件以上に共通するタグがここに出ます</span>}
        <button onClick={copyList} disabled={!its.length} style={{ marginTop: 6, border: 0, background: "#fff", color: "#15171B", borderRadius: 10, padding: "12px 0", fontWeight: 700 }}>一覧をコピーして共有</button>
        <div className="brief">
          <b>このボードからDM構成案を作る</b>
          <label>物件の概要<textarea rows={2} value={brief.property || ""} onChange={(e) => setBrief("property", e.target.value)} placeholder="例：福岡市中央区・3LDK中心・6000万円台・全40戸" /></label>
          <label>DMの目的<input value={brief.purpose || ""} onChange={(e) => setBrief("purpose", e.target.value)} placeholder="例：モデルルーム来場促進" /></label>
          <label>判型<input value={brief.size || ""} onChange={(e) => setBrief("size", e.target.value)} placeholder="例：A4二つ折り／圧着はがき" /></label>
          <label>トーン・その他<input value={brief.memo || ""} onChange={(e) => setBrief("memo", e.target.value)} placeholder="例：高級感、明朝体、写真主役" /></label>
          <button onClick={copyBrief} disabled={!its.length}>構成案の依頼文をコピー</button>
          <span style={{ fontSize: 12, opacity: .8 }}>コピーした文をClaudeのチャットに貼って送ると、構成案とデザインのたたき台を作ります。</span>
        </div>
      </aside>
    </div>
  );
}
