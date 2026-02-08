// api/line/webhook.js
import crypto from "crypto";
import { google } from "googleapis";

/** ====== 設定 ====== */
const PAGE_SIZE = 3; // 1回に返す件数

/** ====== メモリ（簡易セッション） ======
 * Vercelはサーバレスなので永続保証はありませんが、まずは動作確認用にメモリで保持します。
 * 本番はKV/DBに移すのがおすすめ（後で案内できます）
 */
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
    const text = await res.text();
    console.error("LINE reply failed:", res.status, text);
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
  if (!sa.client_email || !sa.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT is invalid");

  const auth = new google.auth.JWT(
    sa.client_email,
    null,
    sa.private_key.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );

  const sheets = google.sheets({ version: "v4", auth });

  // 1枚目シートを想定。必要ならシート名指定に変更OK
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "A:Z",
  });

  const values = resp.data.values || [];
  if (values.length < 2) return [];

  const headers = values[0];
  const rows = values.slice(1);

  // ヘッダー→ index
  const idx = (name) => headers.indexOf(name);

  const iProperty = idx("property_name");
  const iUrl = idx("url");
  const iKeyword = idx("keyword");
  const iUpdated = idx("updated");
  const iFile = idx("file_name");
  const iDeveloper = idx("developer");

  return rows
    .map((r) => ({
      property_name: r[iProperty] || "",
      url: r[iUrl] || "",
      keyword: r[iKeyword] || "",
      updated: r[iUpdated] || "",
      file_name: r[iFile] || "",
      developer: r[iDeveloper] || "",
    }))
    .filter((r) => r.url); // urlがある行だけ
}

/** ====== 検索（複数キーワード対応） ====== */
function searchRows(allRows, queryText) {
  // スペース区切りを複数キーワードとして扱う
  const tokens = queryText
    .trim()
    .split(/\s+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) return [];

  // 行のkeyword（J列）に tokens が全部含まれるものを優先
  const scored = allRows
    .map((r) => {
      const hay = (r.keyword || "").toLowerCase();
      const hitCount = tokens.filter((t) => hay.includes(t)).length;
      return { r, hitCount };
    })
    .filter((x) => x.hitCount > 0)
    .sort((a, b) => b.hitCount - a.hitCount);

  return scored.map((x) => x.r);
}

/** ====== 返信メッセージ整形 ====== */
function formatResults(results, offset, total) {
  const slice = results.slice(offset, offset + PAGE_SIZE);
  if (slice.length === 0) return [{ type: "text", text: "これ以上ありません。" }];

  const lines = slice.map((r, i) => {
    const n = offset + i + 1;
    const title = r.property_name || "（物件名なし）";
    const meta = [r.developer && `(${r.developer})`, r.file_name && `【${r.file_name}】`]
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
  const isValid = signature === hmac;
  if (!isValid) return res.status(401).send("Invalid signature");

  const body = JSON.parse(rawBody);

  // 毎回読む（まず動く優先）。重い場合はキャッシュ化できます
  let allRows = [];
  try {
    allRows = await loadSheetRows();
  } catch (e) {
    console.error(e);
    // LINEへエラー通知（replyTokenがある場合だけ）
    const ev = (body.events || [])[0];
    if (ev?.replyToken) {
      await replyMessage(ev.replyToken, [{ type: "text", text: "シート読込に失敗しました。環境変数を確認してください。" }]);
    }
    return res.status(200).send("OK");
  }

  for (const event of body.events || []) {
    if (event.type !== "message") continue;
    if (event.message?.type !== "text") continue;

    const text = (event.message.text || "").trim();
    const replyToken = event.replyToken;

    // ユーザーキー（グループ対応も考慮）
    const userKey =
      event.source?.userId ||
      event.source?.groupId ||
      event.source?.roomId ||
      "unknown";

    const isNext = /^(さらに|次|next|もっと)$/i.test(text);

    // 次ページ要求
    if (isNext) {
      const sess = SESSIONS.get(userKey);
      if (!sess) {
        await replyMessage(replyToken, [{ type: "text", text: "先に検索キーワードを送ってください。" }]);
        continue;
      }
      sess.offset += PAGE_SIZE;
      SESSIONS.set(userKey, sess);

      await replyMessage(replyToken, formatResults(sess.results, sess.offset, sess.results.length));
      continue;
    }

    // 新規検索
    const results = searchRows(allRows, text);

    if (results.length === 0) {
      await replyMessage(replyToken, [{ type: "text", text: "該当なしでした。別のキーワードで試してください。" }]);
      continue;
    }

    // セッション保存
    SESSIONS.set(userKey, { query: text, results, offset: 0 });

    await replyMessage(replyToken, formatResults(results, 0, results.length));
  }

  return res.status(200).send("OK");
}
