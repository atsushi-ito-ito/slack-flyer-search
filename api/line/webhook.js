// api/line/webhook.js
import crypto from "crypto";
import { google } from "googleapis";

/** ====== 設定 ====== */
const PAGE_SIZE = 3;

/** ====== 簡易セッション（Vercelメモリ） ====== */
const SESSIONS = globalThis.__LINE_SESSIONS__ || new Map();
globalThis.__LINE_SESSIONS__ = SESSIONS;

/** ====== raw body取得（署名検証用） ====== */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** ====== LINE返信 ====== */
async function replyMessage(replyToken, messages) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!res.ok) {
    console.error("LINE reply failed:", res.status, await res.text());
  }
}

/** ====== Sheet読込 ====== */
async function loadSheetRows() {
  const sheetUrl = process.env.SHEET_URL;
  if (!sheetUrl) throw new Error("SHEET_URL is not set");

  const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid SHEET_URL");
  const spreadsheetId = match[1];

  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT is invalid");
  }

  const auth = new google.auth.JWT(
    sa.client_email,
    null,
    sa.private_key.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );

  const sheets = google.sheets({ version: "v4", auth });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "A:Z",
  });

  const values = resp.data.values || [];
  if (values.length < 2) return [];

  const headers = values[0];
  const rows = values.slice(1);

  const idx = (name) => headers.indexOf(name);

  const iArea = idx("area");
  const iProperty = idx("property_name");
  const iUrl = idx("url");
  const iKeyword = idx("keyword");
  const iUpdated = idx("updated");
  const iFile = idx("file_name");
  const iDeveloper = idx("developer");

  return rows
    .map((r) => ({
      area: r[iArea] || "",
      property_name: r[iProperty] || "",
      url: r[iUrl] || "",
      keyword: r[iKeyword] || "",
      updated: r[iUpdated] || "",
      file_name: r[iFile] || "",
      developer: r[iDeveloper] || "",
    }))
    .filter((r) => r.url);
}

/** ====== 正規化 ====== */
function normalize(v) {
  return String(v || "")
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** ====== 検索（AND/OR対応） ====== */
function searchRows(allRows, queryText) {
  const text = normalize(queryText);
  if (!text) return [];

  // OR検索かどうか判定（/ または |）
  const isOrSearch = text.includes("/") || text.includes("|");

  // tokens（ORなら /| 区切り、ANDならスペース区切り）
  const tokens = isOrSearch
    ? text
        .split(/[\/|]/)
        .map((t) => t.trim())
        .filter(Boolean)
    : text.split(" ").filter(Boolean);

  if (tokens.length === 0) return [];

  const scored = allRows
    .map((r) => {
      const hay = normalize(
        [r.area, r.keyword, r.property_name, r.developer, r.file_name].join(" ")
      );

      let hitCount = 0;

      if (isOrSearch) {
        // OR：どれか1つでも含まれればOK
        hitCount = tokens.some((t) => hay.includes(t)) ? 1 : 0;
      } else {
        // AND：すべて含まれている必要あり
        hitCount = tokens.every((t) => hay.includes(t)) ? tokens.length : 0;
      }

      return { r, hitCount };
    })
    .filter((x) => x.hitCount > 0)
    .sort((a, b) => b.hitCount - a.hitCount);

  return scored.map((x) => x.r);
}

/** ====== 「さらに」「次」解析 ====== */
function parseNextCommand(text) {
  const m = text.match(/^(さらに|次|next|もっと)\s*([0-9]+)?\s*(.*)$/i);
  if (!m) return null;

  return {
    pageNum: m[2] ? parseInt(m[2], 10) : null,
    query: (m[3] || "").trim(),
  };
}

/** ====== 表示整形 ====== */
function formatResults(results, offset, total) {
  const slice = results.slice(offset, offset + PAGE_SIZE);
  if (slice.length === 0) return [{ type: "text", text: "これ以上ありません。" }];

  const lines = slice.map((r, i) => {
    const n = offset + i + 1;
    const title = r.property_name || "（名称未設定）";
    const meta = [
      r.area && `[${r.area}]`,
      r.developer && `(${r.developer})`,
      r.file_name && `【${r.file_name}】`,
    ]
      .filter(Boolean)
      .join(" ");
    return `${n}. ${title} ${meta}\n${r.url}`;
  });

  const remain = total - (offset + slice.length);
  const footer =
    remain > 0
      ? `\n\n続きは「さらに」または「次」と送ってください（残り${remain}件）`
      : `\n\n以上です（全${total}件）`;

  return [{ type: "text", text: lines.join("\n\n") + footer }];
}

/** ====== ヘルプテキスト ====== */
function buildHelpMessage() {
  return (
    "🔍 検索の使い方\n\n" +
    "【AND検索（すべて含む）】\n" +
    "・スペース区切りで入力\n" +
    "例：dm 高級感\n\n" +
    "【OR検索（どれか含む）】\n" +
    "・「/」または「|」で区切る\n" +
    "例：dm / 高級感\n\n" +
    "【その他 バナー検索】\n" +
    "・バナー / キーワード\n" +
    "【その他 デベロッパー検索】\n" +
    "・野村不動産\n" +
    "・関電不動産\n" +
    "など\n\n" +
    "「思うようにヒットしない」「URLが切れている」など不具合がありましたら連絡ください。淳\n\n" +
    "続きを見るときは「さらに」または「次」と送ってください。"
    
  );
}

/** ====== メイン ====== */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const rawBody = await getRawBody(req);

  // 署名検証
  const signature = req.headers["x-line-signature"];
  const secret = process.env.LINE_CHANNEL_SECRET;
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  if (signature !== hmac) return res.status(401).send("Invalid signature");

  const body = JSON.parse(rawBody);

  let allRows = [];
  try {
    allRows = await loadSheetRows();
  } catch (e) {
    console.error(e);
    const ev = body.events?.[0];
    if (ev?.replyToken) {
      await replyMessage(ev.replyToken, [
        { type: "text", text: "シート読込に失敗しました。環境変数を確認してください。" },
      ]);
    }
    return res.status(200).send("OK");
  }

  for (const event of body.events || []) {
    if (event.type !== "message") continue;
    if (event.message?.type !== "text") continue;

    const text = (event.message.text || "").trim();
    const replyToken = event.replyToken; // ★先に宣言（これが重要）

    // ===== 検索ヘルプ =====
    if (/^(使い方|ヘルプ|help)$/i.test(text)) {
      await replyMessage(replyToken, [{ type: "text", text: buildHelpMessage() }]);
      continue;
    }

    const userKey =
      event.source?.userId ||
      event.source?.groupId ||
      event.source?.roomId ||
      "unknown";

    const nextCmd = parseNextCommand(text);

    // 続き表示
    if (nextCmd) {
      const sess = SESSIONS.get(userKey);
      const queryToUse = nextCmd.query || sess?.query;

      if (!queryToUse) {
        await replyMessage(replyToken, [
          { type: "text", text: "続きを出すには「さらに 検索語」と送ってください。" },
        ]);
        continue;
      }

      const results = nextCmd.query ? searchRows(allRows, queryToUse) : sess?.results || [];

      let offset;
      if (nextCmd.pageNum) {
        offset = (nextCmd.pageNum - 1) * PAGE_SIZE;
      } else if (sess) {
        offset = (sess.offset || 0) + PAGE_SIZE;
      } else {
        offset = PAGE_SIZE;
      }

      SESSIONS.set(userKey, { query: queryToUse, results, offset });
      await replyMessage(replyToken, formatResults(results, offset, results.length));
      continue;
    }

    // 新規検索
    const results = searchRows(allRows, text);
    if (results.length === 0) {
      await replyMessage(replyToken, [
        { type: "text", text: "該当なしでした。別のキーワードで試してください。" },
      ]);
      continue;
    }

    SESSIONS.set(userKey, { query: text, results, offset: 0 });
    await replyMessage(replyToken, formatResults(results, 0, results.length));
  }

  return res.status(200).send("OK");
}
