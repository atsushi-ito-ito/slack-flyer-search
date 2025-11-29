// api/slack.js
// Slack のイベント（app_mention）を受けて、メンションされたチャンネルに返信するエンドポイント

module.exports = async (req, res) => {
  let body = req.body;

  // body が文字列で来る場合があるのでパースする
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

  // ① URL verification (最初の1回だけ来るやつ)
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // ② イベント本体
  if (body.type === "event_callback") {
    const event = body.event || {};

    // ボット自身のメッセージは無視
    if (event.subtype === "bot_message") {
      return res.status(200).json({ ok: true });
    }

    // app_mention（メンションされた）時に反応
    if (event.type === "app_mention") {
      // Slack にはすぐ 200 を返しておく（3秒制限回避）
      res.status(200).json({ ok: true });

      try {
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          },
          body: JSON.stringify({
            channel: event.channel, // メンションされたチャンネル
            text: "テストです。メンションを受け取りました 👋",
          }),
        });

        const result = await response.json();
        console.log("Slack API response:", result);
      } catch (err) {
        console.error("Slack postMessage error:", err);
      }

      // ここで return しておく
      return;
    }
  }

  // 上のどれでもなければ OK だけ返す
  return res.status(200).json({ ok: true });
};
