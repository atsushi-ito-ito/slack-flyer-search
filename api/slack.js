// api/slack.js
const { WebClient } = require("@slack/web-api");

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

module.exports = async (req, res) => {
  const body = req.body || {};

  // ① URL確認用（SlackのVerification）
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // ② イベントのコールバック
  if (body.type === "event_callback") {
    const event = body.event || {};

    // app_mention（@メンション）だけ処理
    if (event.type === "app_mention") {
      // まずすぐSlackにOKを返す（タイムアウト防止）
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

  // それ以外はとりあえずOKだけ返す
  return res.status(200).json({ ok: true });
};
