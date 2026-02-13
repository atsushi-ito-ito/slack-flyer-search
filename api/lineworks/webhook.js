// api/lineworks/webhook.js
import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * ====== LINE WORKS 設定（環境変数） ======
 * LW_CLIENT_ID           : Developer Console の Client ID
 * LW_CLIENT_SECRET       : Developer Console の Client Secret
 * LW_SERVICE_ACCOUNT     : Service Account（メールアドレス）
 * LW_PRIVATE_KEY         : Private Key（PEM全文。-----BEGIN ... を含む）
 * LW_BOT_ID              : Bot ID
 * LW_BOT_SECRET          : Bot Secret（Callback署名検証用）
 * LW_SCOPE               : 基本 "bot"（必要に応じて "bot user.read" など）
 */
const {
  LW_CLIENT_ID,
  LW_CLIENT_SECRET,
  LW_SERVICE_ACCOUNT,
  LW_PRIVATE_KEY,
  LW_BOT_ID,
  LW_BOT_SECRET,
  LW_SCOPE = "bot",
} = process.env;

const TOKEN_ENDPOINT = "https://auth.worksmobile.com/oauth2/v2.0/token";
const API_BASE = "https://www.worksapis.com/v1.0";

// ====== raw body取得（署名検証に必須） ======
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ====== Callback署名検証（X-WORKS-Signature） ======
// Bot Secret を鍵に HMAC-SHA256 → Base64 して比較 :contentReference[oaicite:1]{index=1}
function verifyWorksSignature(rawBody, signatureHeader, botSecret) {
  if (!signatureHeader || !botSecret) return false;
  const computed = crypto
    .createHmac("sha256", botSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  // timing-safe compare
  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ====== Access Token 取得（Service Account JWT） ======
let CACHED_TOKEN = null;
let CACHED_TOKEN_EXPIRES_AT = 0;

async function getAccessToken() {
  const now = Date.now();

  // 余裕を見て60秒前に期限切れ扱い
  if (CACHED_TOKEN && now < CACHED_TOKEN_EXPIRES_AT - 60_000) {
    return CACHED_TOKEN;
  }

  if (!LW_CLIENT_ID || !LW_CLIENT_SECRET || !LW_SERVICE_ACCOUNT || !LW_PRIVATE_KEY) {
    throw new Error("Missing LINE WORKS env vars for JWT auth.");
  }

  // JWT payload: iss=CLIENT_ID, sub=SERVICE_ACCOUNT, iat/exp :contentReference[oaicite:2]{index=2}
  const iat = Math.floor(now / 1000);
  const exp = iat + 60 * 60; // 1 hour

  const assertion = jwt.sign(
    { iss: LW_CLIENT_ID, sub: LW_SERVICE_ACCOUNT, iat, exp },
    LW_PRIVATE_KEY.replace(/\\n/g, "\n"),
    { algorithm: "RS256", header: { typ: "JWT" } }
  );

  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("client_id", LW_CLIENT_ID);
  form.set("client_secret", LW_CLIENT_SECRET);
  form.set("scope", LW_SCOPE);
  form.set("assertion", assertion);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${text}`);
  }

  const json = JSON.parse(text);
  const accessToken = json.access_token;
  const expiresIn = Number(json.expires_in || 0);

  if (!accessToken) {
    throw new Error(`Token response missing access_token: ${text}`);
  }

  CACHED_TOKEN = accessToken;
  CACHED_TOKEN_EXPIRES_AT = now + expiresIn * 1000;

  return accessToken;
}

// ====== 返信（トークルーム or 1:1） ======
async function sendMessageToChannel(channelId, content) {
  const token = await getAccessToken();

  const url = `${API_BASE}/bots/${encodeURIComponent(LW_BOT_ID)}/channels/${encodeURIComponent(
    channelId
  )}/messages`; // POST /bots/{botId}/channels/{channelId}/messages :contentReference[oaicite:3]{index=3}

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  const bodyText = await res.text();
  if (!res.ok) throw new Error(`sendMessageToChannel failed: ${res.status} ${bodyText}`);
  return bodyText;
}

async function sendMessageToUser(userId, content) {
  const token = await getAccessToken();

  const url = `${API_BASE}/bots/${encodeURIComponent(LW_BOT_ID)}/users/${encodeURIComponent(
    userId
  )}/messages`; // POST /bots/{botId}/users/{userId}/messages :contentReference[oaicite:4]{index=4}

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  const bodyText = await res.text();
  if (!res.ok) throw new Error(`sendMessageToUser failed: ${res.status} ${bodyText}`);
  return bodyText;
}

// ====== Webhook Handler ======
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    // raw body取得（署名検証のため）
    const rawBody = await getRawBody(req);

    // 署名検証（X-WORKS-Signature）
    const signature = req.headers["x-works-signature"];
    const ok = verifyWorksSignature(rawBody, signature, LW_BOT_SECRET);
    if (!ok) {
      res.status(401).send("Invalid signature");
      return;
    }

    const body = JSON.parse(rawBody);

    // 代表的なイベント: type === "message"、content.type === "text" :contentReference[oaicite:5]{index=5}
    if (body?.type === "message" && body?.content?.type === "text") {
      const text = (body.content.text || "").trim();
      const channelId = body?.source?.channelId;
      const userId = body?.source?.userId;

      // ===== ここに「あなたの既存ロジック」を入れる（例） =====
      // const replyText = await yourSearchAndPagingLogic(text, userId);
      // ひとまず動作確認用：オウム返し
      const replyText = `受信: ${text}`;

      const content = { type: "text", text: replyText };

      // channelId があればトークルームに返信（通常こちら）
      if (channelId) {
        await sendMessageToChannel(channelId, content);
      } else if (userId) {
        // 念のため 1:1 fallback
        await sendMessageToUser(userId, content);
      }
    }

    // LINE WORKS は「受信に対して 200 を返す」でOK（返信は別APIで送る）
    res.status(200).send("OK");
  } catch (e) {
    console.error(e);
    res.status(500).send(`Error: ${e.message}`);
  }
}
