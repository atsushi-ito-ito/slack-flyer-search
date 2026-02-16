// api/line/webhook.js
import crypto from "crypto";
import { searchFlyers } from "../../lib/flyerEngine.js";

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

/** ====== 正規化（軽め） ====== */
function normalizeForTokens(v) {
  return String(v || "")
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ====== LINE入力 → mode/keywords に変換 ======
 * - OR検索: "/" or "|"
 * - AND検索: スペース区切り
 */
function parseQueryToModeKeywords(queryText) {
  const text = normalizeForTokens(queryText);
  if (!text) return { mode: "AND", keywords: [] };

  const isOr = text.includes("/") || text.includes("|");
  const tokens = isOr
    ? text
        .split(/[\/|]/)
        .map((t) => t.trim())
        .filter(Boolean)
    : text.split(" ").map((t) => t.trim()).filter(Boolean);

  return { mode: isOr ? "OR" : "AND", keywords: tokens };
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

/** ====== 表示整形（ページング対応） ====== */
function formatResults(items, page, totalCount) {
  if (!items || items.length === 0) {
    return [{ type: "text", text: "これ以上ありません。" }];
  }

  const offset = (page - 1) * PAGE_SIZE;

  const lines = items.map((r, i) => {
    const n = offset + i + 1;
    const title = r.title || "（名称未設定）";

    const meta = [
      r.area && `[${r.area}]`,
      r.prefectures && `【${r.prefectures}】`,
      r.municipalities && `【${r.municipalities}】`,
      r.developer && `(${r.developer})`,
      r.file_name && `【${r.file_name}】`, // flyerEngine側が返すなら表示（返さないなら空でOK）
    ]
      .filter(Boolean)
      .join(" ");

    return `${n}. ${title} ${meta}\n${r.url || ""}`.trim();
  });

  const shown = offset + items.length;
  const remain = Math.max(0, totalCount - shown);

  const footer =
    remain > 0
      ? `\n\n続きは「さらに」または「次」と送ってください（残り${remain}件）`
      : `\n\n以上です（全${totalCount}件）`;

  return [{ type: "text", text: lines.join("\n\n") + footer }];
}

/** ====== ヘルプテキスト ====== */
function buildHelpMessage() {
  return (
    "🔍 検索の使い方\n\n" +
    "【AND検索（すべて含む）】\n" +
    "・スペース区切りで入力\n" +
    "例：福岡県 中央区 高級感\n\n" +
    "【OR検索（どれか含む）】\n" +
    "・「/」または「|」で区切る\n" +
    "例：福岡県 / 札幌市\n\n" +
    "【検索対象】\n" +
    "・area / prefectures / municipalities / 物件名 / keyword / developer / file_name（台帳にある範囲）\n\n" +
    "「思うようにヒットしない」「URLが切れている」など不具合がありましたら販売促進課まで連絡ください。\n\n" +
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

  for (const event of body.events || []) {
    if (event.type !== "message") continue;
    if (event.message?.type !== "text") continue;

    const text = (event.message.text || "").trim();
    const replyToken = event.replyToken;

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

    // ===== 続き表示 =====
    if (nextCmd) {
      const sess = SESSIONS.get(userKey);
      const queryToUse = nextCmd.query || sess?.query;

      if (!queryToUse) {
        await replyMessage(replyToken, [
          { type: "text", text: "続きを出すには「さらに 検索語」と送ってください。" },
        ]);
        continue;
      }

      // 新しいqueryが来た場合は1ページ目から
      const { mode, keywords } = parseQueryToModeKeywords(queryToUse);

      let page;
      if (nextCmd.pageNum) page = nextCmd.pageNum;
      else page = (sess?.page || 1) + 1;

      try {
        const data = await searchFlyers({
          mode,
          keywords,
          page,
          pageSize: PAGE_SIZE,
        });

        // セッション更新（結果配列は持たず、queryとpageだけ）
        SESSIONS.set(userKey, { query: queryToUse, mode, keywords, page });

        await replyMessage(replyToken, formatResults(data.items, page, data.count));
      } catch (e) {
        console.error(e);
        await replyMessage(replyToken, [
          { type: "text", text: "検索に失敗しました。環境変数やシート設定を確認してください。" },
        ]);
      }
      continue;
    }

    // ===== 新規検索 =====
    const { mode, keywords } = parseQueryToModeKeywords(text);
    if (!keywords.length) {
      await replyMessage(replyToken, [{ type: "text", text: "検索キーワードを入力してください。" }]);
      continue;
    }

    try {
      const data = await searchFlyers({
        mode,
        keywords,
        page: 1,
        pageSize: PAGE_SIZE,
      });

      if (data.count === 0) {
        await replyMessage(replyToken, [
          { type: "text", text: "該当なしでした。別のキーワードで試してください。" },
        ]);
        continue;
      }

      SESSIONS.set(userKey, { query: text, mode, keywords, page: 1 });
      await replyMessage(replyToken, formatResults(data.items, 1, data.count));
    } catch (e) {
      console.error(e);
      await replyMessage(replyToken, [
        { type: "text", text: "検索に失敗しました。環境変数やシート設定を確認してください。" },
      ]);
    }
  }

  return res.status(200).send("OK");
}
