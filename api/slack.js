// api/slack.js
const { google } = require("googleapis");

// 台帳データ
let FLYERS = [];

// 1ページに表示する件数
const PAGE_SIZE = 3;

/**
 * Google スプレッドシートから台帳データを読み込む
 * - env: SHEET_URL, GOOGLE_SERVICE_ACCOUNT
 */
async function loadSheetData() {
  try {
    const sheetUrl = process.env.SHEET_URL;
    if (!sheetUrl) {
      console.error("SHEET_URL is not set");
      return [];
    }

    const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      console.error("Invalid SHEET_URL:", sheetUrl);
      return [];
    }
    const spreadsheetId = match[1];

    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
    if (!serviceAccount.client_email) {
      console.error("GOOGLE_SERVICE_ACCOUNT is not set or invalid JSON");
      return [];
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // ※シート指定が必要なら "シート名!A1:Z1000" に変更
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "A1:Z1000",
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) return [];

    const headers = rows[0];
    const list = rows.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return obj;
    });

    return list;
  } catch (err) {
    console.error("Google Sheets Load Error:", err);
    return [];
  }
}

/**
 * Sheets row -> FLYERS
 * スプレッドシートのヘッダー名に合わせてマッピング
 */
function mapRowsToFlyers(sheetRows) {
  return (sheetRows || []).map((row) => ({
    area: row["area"] || "",
    prefectures: row["prefectures"] || "",
    municipalities: row["municipalities"] || "",
    propertyName: row["property_name"] || "",
    style: row["style"] || "",
    target: row["target"] || "",
    layout: row["layout"] || "",
    url: row["url"] || row["URL"] || "",
    updated: row["updated"] || "",
    keywords: (row["keyword"] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    developer: row["developer"] || "",
    fileName: row["file_name"] || "",
  }));
}

/**
 * Slackへ投稿（Block Kit対応）
 */
async function postToSlack(channel, text, blocks) {
  try {
    const payload = { channel, text };
    if (blocks && Array.isArray(blocks) && blocks.length > 0) {
      payload.blocks = blocks;
    }

    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await resp.json();
    if (!result.ok) console.error("Slack API error:", result);
  } catch (err) {
    console.error("Slack postMessage error:", err);
  }
}

/**
 * Block Kit: 候補カード（ご希望の形）
 * 宮城県 / 仙台市
 * シエリア仙台五橋（太字）
 * 事業主：◯◯不動産
 * 📄 3.シエリア仙台五橋_dm_1
 */
function buildFlyerBlocks(rows) {
  const blocks = [];

  rows.forEach((row, idx) => {
    const locationLine = [row.prefectures, row.municipalities]
      .filter(Boolean)
      .join(" / ");

    const propertyLine = row.propertyName || "(物件名未設定)";
    const developerLine = row.developer ? `事業主：${row.developer}` : "";
    const fileLine = row.fileName ? `📄 ${row.fileName}` : "";

    const lines = [locationLine, `*${propertyLine}*`, developerLine, fileLine].filter(Boolean);

    const section = {
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    };

    if (row.url) {
      section.accessory = {
        type: "button",
        text: { type: "plain_text", text: "PDFを開く" },
        url: row.url,
      };
    }

    blocks.push(section);
    if (idx < rows.length - 1) blocks.push({ type: "divider" });
  });

  return blocks;
}

/**
 * タグ判定（必要に応じて増やせます）
 */
function detectTags(text) {
  const rules = [
    { id: "pop", jaLabel: "ポップな雰囲気のチラシ", keywords: ["ポップ", "POP", "ポップ系"] },
    { id: "family", jaLabel: "ファミリー向けのチラシ", keywords: ["ファミリー向け", "ファミリー", "家族"] },
    { id: "3ldk", jaLabel: "3LDKを訴求しているチラシ", keywords: ["3LDK", "３ＬＤＫ", "3ldk"] },
  ];

  const lower = (text || "").toLowerCase();
  return rules.filter((r) => r.keywords.some((kw) => lower.includes(String(kw).toLowerCase())));
}

/**
 * keyword列の一致を「表示用」に集める（任意）
 */
function collectMatchedKeywords(text) {
  const lower = (text || "").toLowerCase();
  const set = new Set();

  FLYERS.forEach((row) => {
    (row.keywords || []).forEach((kw) => {
      if (lower.includes(String(kw).toLowerCase())) set.add(kw);
    });
  });

  return Array.from(set);
}

/**
 * タグフィルタ
 */
function filterFlyersByTags(tags) {
  if (!tags || tags.length === 0) return [];

  return FLYERS.filter((row) =>
    tags.every((tag) => {
      switch (tag.id) {
        case "pop":
          return row.style && (row.style.includes("pop") || row.style.includes("ポップ"));
        case "family":
          return row.target && row.target.includes("ファミリー");
        case "3ldk":
          if (row.layout && String(row.layout).toUpperCase().includes("3LDK")) return true;
          return (row.keywords || []).some((kw) => String(kw).toUpperCase().includes("3LDK"));
        default:
          return true;
      }
    })
  );
}

/**
 * 全文検索（双方向の部分一致）
 * - 仙台市 -> municipalities
 * - 野村不動産 -> developer
 * - 物件名、都道府県、地域区分、ファイル名、style/target なども対象
 */
function searchFlyersByKeywords(text) {
  const q = (text || "").toLowerCase().trim();
  if (!q) return [];

  return FLYERS.filter((row) => {
    const dev = String(row.developer || "").toLowerCase();
    const prop = String(row.propertyName || "").toLowerCase();
    const area = String(row.area || "").toLowerCase();
    const pref = String(row.prefectures || "").toLowerCase();
    const muni = String(row.municipalities || "").toLowerCase();
    const file = String(row.fileName || "").toLowerCase();
    const style = String(row.style || "").toLowerCase();
    const target = String(row.target || "").toLowerCase();

    const keywords = Array.isArray(row.keywords) ? row.keywords : [];
    const hitKeyword = keywords.some((kw) => {
      const k = String(kw || "").toLowerCase();
      return k.includes(q) || q.includes(k);
    });

    const hitDeveloper = dev && (dev.includes(q) || q.includes(dev));
    const hitProperty = prop && (prop.includes(q) || q.includes(prop));
    const hitArea = area && (area.includes(q) || q.includes(area));
    const hitPref = pref && (pref.includes(q) || q.includes(pref));
    const hitMuni = muni && (muni.includes(q) || q.includes(muni));
    const hitFileName = file && (file.includes(q) || q.includes(file));
    const hitStyle = style && (style.includes(q) || q.includes(style));
    const hitTarget = target && (target.includes(q) || q.includes(target));

    return (
      hitKeyword ||
      hitDeveloper ||
      hitProperty ||
      hitArea ||
      hitPref ||
      hitMuni ||
      hitFileName ||
      hitStyle ||
      hitTarget
    );
  });
}

/**
 * Slack からの body を安全にパース
 * - event_callback は JSON
 * - interactivity は x-www-form-urlencoded の payload=... になることが多い
 */
function normalizeBody(req) {
  let body = req.body;

  // 文字列なら JSON or payload= を判定
  if (typeof body === "string") {
    // payload= 形式
    if (body.startsWith("payload=")) {
      const params = new URLSearchParams(body);
      const payloadStr = params.get("payload");
      if (payloadStr) return { payload: payloadStr };
      return {};
    }

    // JSON文字列
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  // オブジェクトの場合（VercelがJSON/フォームを解析済み）
  return body || {};
}

// -------------------- メインハンドラ --------------------
module.exports = async (req, res) => {
  const body = normalizeBody(req);

  // ログ（必要なら）
  console.log("Slack request body:", JSON.stringify(body, null, 2));

  // --- Interactivity（ボタン押下） ---
  // SlackのInteractivityは body.payload に JSON文字列が入ってくる
  if (body && body.payload) {
    try {
      const payload = typeof body.payload === "string" ? JSON.parse(body.payload) : body.payload;

      if (payload.type === "block_actions") {
        const action = payload.actions?.[0];

        if (action?.action_id === "show_more") {
          const { q, offset } = JSON.parse(action.value || "{}");

          // 台帳を再読み込み（最新反映）
          const sheetRows = await loadSheetData();
          FLYERS = mapRowsToFlyers(sheetRows);

          const hits = searchFlyersByKeywords(q);

          const nextRows = hits.slice(offset, offset + PAGE_SIZE);
          const blocks = buildFlyerBlocks(nextRows);

          // まだ残りがあるなら、次の「さらに表示」ボタンを付ける
          if (offset + PAGE_SIZE < hits.length) {
            blocks.push({
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "さらに表示" },
                  action_id: "show_more",
                  value: JSON.stringify({ q, offset: offset + PAGE_SIZE }),
                },
              ],
            });
          }

          // response_url へ追加投稿（replace_original: false）
          await fetch(payload.response_url, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              replace_original: false,
              text: "追加の候補です",
              blocks,
            }),
          });

          return res.status(200).send();
        }
      }
    } catch (err) {
      console.error("Interactivity handler error:", err);
      return res.status(200).send();
    }

    return res.status(200).send();
  }

  // URL 認証（Event Subscriptions）
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // イベント
  if (body.type === "event_callback") {
    const event = body.event || {};

    // bot自身の投稿を無視
    if (event.subtype === "bot_message") {
      return res.status(200).json({ ok: true });
    }

    // メンション受信
    if (event.type === "app_mention") {
      try {
        // 1) 台帳読み込み
        const sheetRows = await loadSheetData();
        if (!sheetRows || sheetRows.length === 0) {
          await postToSlack(event.channel, "台帳が空のようです 🤔（スプレッドシートを確認してください）");
          return res.status(200).json({ ok: true });
        }

        // 2) 台帳をFLYERSへ
        FLYERS = mapRowsToFlyers(sheetRows);

        // 3) ユーザー入力（メンション除去）
        const text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
        console.log("User text:", text);

        // 4) タグ・キーワード判定
        const matchedTags = detectTags(text);
        const matchedKeywords = collectMatchedKeywords(text);

        let hitFlyers = [];
        if (matchedTags.length > 0) {
          hitFlyers = filterFlyersByTags(matchedTags);
          if (hitFlyers.length === 0) {
            hitFlyers = searchFlyersByKeywords(text);
          }
        } else {
          hitFlyers = searchFlyersByKeywords(text);
        }

        // 5) 0件なら案内
        if (hitFlyers.length === 0) {
          const reply =
            "該当するチラシが見つかりませんでした 🤔\n\n" +
            "例えば、次のように話しかけてください 👇\n" +
            "・仙台市 のチラシ\n" +
            "・宮城県 のチラシ\n" +
            "・野村不動産 のチラシ\n" +
            "・ポップなチラシを探して\n" +
            "・ファミリー向けのチラシを探して\n" +
            "・3LDKを訴求しているチラシを探して";
          await postToSlack(event.channel, reply);
          return res.status(200).json({ ok: true });
        }

        // 6) 最初は3件
        const top = hitFlyers.slice(0, PAGE_SIZE);

        // --- Block Kit作成 ---
        const blocks = [];

        blocks.push({
          type: "header",
          text: { type: "plain_text", text: "チラシ候補 🔍" },
        });

        // 条件表示（任意）
        const conditionLines = [];
        if (matchedTags.length > 0) {
          conditionLines.push("*タグ条件:*\n" + matchedTags.map((t) => `・${t.jaLabel}`).join("\n"));
        }
        if (matchedKeywords.length > 0) {
          conditionLines.push("*キーワード一致:*\n" + matchedKeywords.map((k) => `・${k}`).join("\n"));
        }
        if (conditionLines.length > 0) {
          blocks.push({ type: "section", text: { type: "mrkdwn", text: conditionLines.join("\n\n") } });
          blocks.push({ type: "divider" });
        }

        // 候補カード
        blocks.push(...buildFlyerBlocks(top));

        // 残りがあれば「さらに表示」ボタン
        if (hitFlyers.length > PAGE_SIZE) {
          blocks.push({
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "さらに表示" },
                action_id: "show_more",
                value: JSON.stringify({ q: text, offset: PAGE_SIZE }),
              },
            ],
          });
        }

        // fallbackテキスト
        const fallbackText =
          "次の条件でチラシ候補を見つけました 🔍\n" +
          top
            .map((r, i) => {
              const loc = [r.prefectures, r.municipalities].filter(Boolean).join(" / ");
              const parts = [loc || "", r.propertyName || ""].filter(Boolean).join(" ");
              return `${i + 1}. ${parts}\n   ${r.url || "URL未登録"}`;
            })
            .join("\n\n");

        await postToSlack(event.channel, fallbackText, blocks);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error("app_mention error:", err);
        await postToSlack(event.channel, "内部エラーが発生しました 🙇‍♂️（ログを確認してください）");
        return res.status(200).json({ ok: true });
      }
    }
  }

  return res.status(200).json({ ok: true });
};
