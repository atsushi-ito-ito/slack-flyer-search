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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const rawBody = await getRawBody(req);

  // 署名検証（LINEから来た本物のリクエストか確認）
  const signature = req.headers["x-line-signature"];
  const secret = process.env.LINE_CHANNEL_SECRET;

  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const isValid = signature === hmac;

  console.log("LINE webhook received:", {
    isValid,
    hasSignature: !!signature,
    bodyPreview: rawBody.slice(0, 200),
  });

  // 不正なら 401
  if (!isValid) return res.status(401).send("Invalid signature");

  // まずは成功応答だけ返す（返信処理は次のステップで入れる）
  return res.status(200).send("OK");
}
