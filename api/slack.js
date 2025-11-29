// api/slack.js
// Slack の app_mention を受けて、キーワードを判定して返信する

module.exports = async (req, res) => {
  let body = req.body;

  // body が文字列ならパース
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

  // 1) URL認証（最初の1回だけ）
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // 2) 通常のイベント
  if (body.type === "event_callback") {
    const event = body.event || {};

    // Bot 自身のメッセージは無視
    if (event.subtype === "bot_message") {
      return res.status(200).json({ ok: true });
    }

    // メンションされたとき
    if (event.type === "app_mention") {
      // ------------- ユーザー文からキーワード抽出 -------------
      let text = event.text || "";
      // 先頭の <@Uxxxx> みたいなメンションを削る
      text = text.replace(/<@[^>]+>/g, "").trim();
      console.log("User text:", text);

      const matchedTags = detectTags(text);

      let reply;
      if (matchedTags.length === 0) {
        reply =
          "キーワードがうまく読み取れませんでした 🤔\n\n" +
          "例えば、次のように話しかけてください 👇\n" +
          "・ポップなチラシを探して\n" +
          "・ファミリー向けのチラシを探して\n" +
          "・3LDKを訴求しているチラシを探して";
      } else {
        reply =
          "次の条件でチラシを探します 🔍\n" +
          matchedTags.map((t) => `・${t.jaLabel}`).join("\n") +
          "\n\n※ 今はテストモードです。あとでExcel/OneDriveと連携して実際の候補を返します。";
      }

      // ------------- Slack に返信 -------------
      try {
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          },
          body: JSON.stringify({
            channel: event.channel,
            text: reply,
          }),
        });

        const result = await response.json();
        console.log("Slack API response:", result);
      } catch (err) {
        console.error("Slack postMessage error:", err);
      }

      // Slack への最終レスポンス
      return res.status(200).json({ ok: true });
    }
  }

  // それ以外はそのままOKを返す
  return res.status(200).json({ ok: true });
};

// ---------------- キーワード判定ロジック ----------------

function detectTags(text) {
  const rules = [
    {
      id: "pop",
      jaLabel: "ポップな雰囲気のチラシ",
      keywords: ["ポップ", "POP", "ポップ系"],
    },
    {
      id: "family",
      jaLabel: "ファミリー向けのチラシ",
      keywords: ["ファミリー向け", "ファミリー", "家族"],
    },
    {
      id: "3ldk",
      jaLabel: "3LDKを訴求しているチラシ",
      keywords: ["3LDK", "３ＬＤＫ", "3ldk"],
    },
  ];

  const lower = text.toLowerCase();

  const matched = [];

  for (const rule of rules) {
    const hit = rule.keywords.some((kw) =>
      lower.includes(kw.toLowerCase())
    );
    if (hit) {
      matched.push(rule);
    }
  }

  return matched;
}
