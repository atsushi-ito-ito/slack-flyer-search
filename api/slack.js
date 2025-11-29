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
    // 〜〜 省略（URL verification など上の部分はそのまま） 〜〜

  if (body.type === "event_callback") {
    const event = body.event || {};

    if (event.subtype === "bot_message") {
      return res.status(200).json({ ok: true });
    }

    if (event.type === "app_mention") {
      // Slack には先に 200 を返す
      res.status(200).json({ ok: true });

      // ① メッセージ本文を取り出して、Bot メンション部分を削る
      let text = event.text || "";
      // 例: "<@U12345678> ポップなチラシを探して" → メンションを空文字に
      text = text.replace(/<@[^>]+>/g, "").trim();

      console.log("User text:", text);

      // ② キーワード判定ロジック
      const matchedTags = detectTags(text);

      // ③ 返信メッセージ作成（今はダミー）
      let reply;
      if (matchedTags.length === 0) {
        reply =
          "キーワードがうまく読み取れませんでした。\n\n" +
          "例えば、次のように話しかけてください 👇\n" +
          "・ポップなチラシを探して\n" +
          "・ファミリー向けのチラシを探して\n" +
          "・3LDKを訴求しているチラシを探して";
      } else {
        reply =
          "次の条件でチラシを探します 🔍\n" +
          matchedTags.map((t) => `・${t.jaLabel}`).join("\n") +
          "\n\n※ 今はダミー返信です。あとでExcel/OneDriveと連携して実際の候補を返すようにします。";
      }

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

      return;
    }
  }

  return res.status(200).json({ ok: true });
};

// ここから下にキーワード判定ロジックを追加
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

  const lower = text.toLowerCase(); // 英字用（pop, 3ldk 等）

  const matched = [];

  for (const rule of rules) {
    const hit = rule.keywords.some((kw) => {
      // キーワード側も toLowerCase して、英字もひらがなもざっくり判定
      return lower.includes(kw.toLowerCase());
    });
    if (hit) {
      matched.push(rule);
    }
  }

  return matched;
}

  }

  // 上のどれでもなければ OK だけ返す
  return res.status(200).json({ ok: true });
};
