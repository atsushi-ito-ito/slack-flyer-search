import fetch from "node-fetch";

export default async function handler(req, res) {
  // Slack の challenge 認証
  if (req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  const event = req.body.event;

  // ボットのメッセージは無視
  if (event?.subtype === "bot_message") {
    return res.status(200).json({ ok: true });
  }

  // メンションされたときの返信
  if (event.type === "app_mention") {
  const text = "了解しました！";

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel: event.channel,
      text: text,
    }),
  });

  const result = await response.json();
  console.log("Slack API response:", result);
}


  res.status(200).json({ ok: true });
}
