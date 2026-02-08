// api/line/webhook.js
import crypto from "crypto";

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function replyMessage(replyToken, messages) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("LINE reply failed:", res.status, text);
  }
}

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

  // イベント解析
  const body = JSON.parse(rawBody);

  // Webhookは複数eventが来るのでループ
  for (const event of body.events || []) {
    // メッセージ以外（follow, join等）はスキップ
    if (event.type !== "message") continue;
    if (event.message?.type !== "text") continue;

    const text = event.message.text;
    const replyToken = event.replyToken;

    // オウム返し返信
    await replyMessage(replyToken, [
      { type: "text", text: `受信しました：${text}` },
    ]);
  }

  return res.status(200).send("OK");
}
