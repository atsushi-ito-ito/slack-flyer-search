// api/slack.js

export default function handler(req, res) {
  // Slack の URL 検証用
  if (req.body && req.body.type === "url_verification") {
    // Slack から送られてきた challenge をそのまま返す
    return res.status(200).send(req.body.challenge);
  }

  // それ以外のリクエストには、とりあえず OK だけ返す
  return res.status(200).json({ ok: true });
}
