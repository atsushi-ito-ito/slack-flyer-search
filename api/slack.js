// api/slack.js
const { WebClient } = require("@slack/web-api");

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

module.exports = async (req, res) => {
  let body = req.body;

  // Slack から body が「文字列」で来ることがあるのでパースする
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      console.error("Failed to parse body:", e, body);
      return res.status(200).json({ ok: false });
    }
  }

  body = body || {};
  console.log("Slack request body:", JSON.stringify(body, null, 2));

  // ① URL Verification
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // ② Event Callback
  if (body.type === "event_callback") {
    const event = body.event || {};

    if (event.type === "app_mention") {
      // まずすぐ Slack にOK返す（3秒タイムアウト防止）
      res.status(200).json({ ok: true });

      try {
        await client.chat.postMessage({
          channel: event.channel,
          text: "テストです。チラシ検索Botが反応しました 👋",
        });
      } catch (e) {
        console.error("Slack postMessage error:", e);
      }
      return;
    }
  }

  // それ以外
  return res.status(200).json({ ok: true });
};
