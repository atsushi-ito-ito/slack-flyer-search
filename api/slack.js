// -------------------- ダミー台帳（後で Excel と連携） --------------------
// -------------------- 台帳（あとで Excel と対応させる） --------------------
const FLYERS = [
  {
    id: 1,
    propertyName: "ジェイグラン平和",
    style: "ファミリー",
    target: "ファミリー",
    layout: "3LDK",
    copy: "ZEH-M認定",
    url: "https://example.com/1",
    updated: "2024_04",
    // ★このチラシに紐づくキーワードを配列で持つ
    keywords: ["ポップ", "ファミリー", "3LDK", "ZEH"],
  },
  {
    id: 2,
    propertyName: "ジェイグラン平和",
    style: "高級感",
    target: "高所得者",
    layout: "2LDK",
    copy: "先着順",
    url: "https://example.com/2",
    updated: "2024_06",
    keywords: ["高級感", "大人向け", "2LDK"],
  },
  // 以下、台帳の行ごとに keywords: [...] を追加していく
];


// -------------------- メイン関数（Slackエンドポイント） --------------------
module.exports = async (req, res) => {
  let body = req.body;

  // body が文字ならパース
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      console.error("JSON parse error:", err);
      return res.status(200).json({ ok: false });
    }
  }

  console.log("Slack request body:", JSON.stringify(body, null, 2));

  // URL認証
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // イベント受信
  if (body.type === "event_callback") {
    const event = body.event || {};

    // Botメッセージは無視
    if (event.subtype === "bot_message") {
      return res.status(200).json({ ok: true });
    }

    // メンション受信
    if (event.type === "app_mention") {
      let text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
      console.log("User text:", text);

          // メンション受信
    if (event.type === "app_mention") {
      let text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
      console.log("User text:", text);

      // ① ユーザー文からタグ判定
      const matchedTags = detectTags(text);

      // ② タグがある場合はタグ絞り込み、なければキーワード全文検索
      let hitFlyers = [];
      let matchedKeywords = [];

      if (matchedTags.length > 0) {
        hitFlyers = filterFlyersByTags(matchedTags);
      } else {
        hitFlyers = searchFlyersByKeywords(text);
        matchedKeywords = collectMatchedKeywords(text);
      }

      let reply = "";

      // ③ 返信メッセージ組み立て
      if (matchedTags.length === 0 && matchedKeywords.length === 0) {
        // タグもキーワードも取れなかった場合
        reply =
          "キーワードがうまく読み取れませんでした 🤔\n\n" +
          "例えば、次のように話しかけてください 👇\n" +
          "・ポップなチラシを探して\n" +
          "・ファミリー向けのチラシを探して\n" +
          "・3LDKを訴求しているチラシを探して";
      } else if (hitFlyers.length === 0) {
        // 条件はあるが台帳にヒットしない場合
        const condLines =
          matchedTags.length > 0
            ? matchedTags.map((t) => `・${t.jaLabel}`).join("\n")
            : matchedKeywords.map((k) => `・${k}`).join("\n");

        reply =
          "次の条件でチラシを探しましたが、該当する台帳がありませんでした。\n\n" +
          "条件:\n" +
          condLines;
      } else {
        // 実際に候補が見つかった場合
        const top = hitFlyers.slice(0, 3);

        const condLines =
          matchedTags.length > 0
            ? matchedTags.map((t) => `・${t.jaLabel}`).join("\n")
            : matchedKeywords.map((k) => `・${k}`).join("\n");

        reply =
          "次の条件でチラシ候補を見つけました 🔍\n" +
          condLines +
          "\n\n候補一覧（最大3件）：\n" +
          top
            .map(
              (row, idx) =>
                `${idx + 1}. ${row.propertyName} / ${row.layout}\n` +
                `   ${row.copy || ""}\n` +
                `   ${row.url}`
            )
            .join("\n\n");
      }

      // Slackに返信（ここより下は今のままでOK）
      try {
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          },
          body: JSON.stringify({
            channel: event.channel,
            text: reply,
          }),
        });

        console.log("Slack API response:", await response.json());
      } catch (err) {
        console.error("Slack postMessage error:", err);
      }

      return res.status(200).json({ ok: true });
    }


      // Slackに返信
      try {
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          },
          body: JSON.stringify({
            channel: event.channel,
            text: reply,
          }),
        });

        console.log("Slack API response:", await response.json());
      } catch (err) {
        console.error("Slack postMessage error:", err);
      }

      return res.status(200).json({ ok: true });
    }
  }

  return res.status(200).json({ ok: true });
};


// -------------------- キーワード判定 --------------------
function detectTags(text) {
  const rules = [
    { id: "pop", jaLabel: "ポップな雰囲気のチラシ", keywords: ["ポップ", "POP", "ポップ系"] },
    { id: "family", jaLabel: "ファミリー向けのチラシ", keywords: ["ファミリー", "家族"] },
    { id: "3ldk", jaLabel: "3LDKを訴求しているチラシ", keywords: ["3LDK", "３ＬＤＫ", "3ldk"] },
  ];

  const lower = text.toLowerCase();
  return rules.filter((rule) =>
    rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))
  );
}

// -------------------- キーワード全文検索 --------------------
function searchFlyersByKeywords(text) {
  const lower = text.toLowerCase();

  return FLYERS.filter((row) => {
    if (!row.keywords || row.keywords.length === 0) return false;

    // ユーザーの発言の中に、いずれかのキーワードが含まれていればヒット
    return row.keywords.some((kw) =>
      lower.includes(kw.toLowerCase())
    );
  });
}

// どんなキーワードでヒットしたか、表示用にまとめる
function collectMatchedKeywords(text) {
  const lower = text.toLowerCase();
  const hitSet = new Set();

  FLYERS.forEach((row) => {
    (row.keywords || []).forEach((kw) => {
      if (lower.includes(kw.toLowerCase())) {
        hitSet.add(kw);
      }
    });
  });

  return Array.from(hitSet);
}


// -------------------- 台帳フィルタ --------------------
function filterFlyersByTags(tags) {
  if (!tags || tags.length === 0) return [];

  return FLYERS.filter((row) =>
    tags.every((tag) => {
      switch (tag.id) {
        case "pop":
          return row.style.includes("ポップ");
        case "family":
          return row.target.includes("ファミリー");
        case "3ldk":
          return row.layout.toUpperCase().includes("3LDK");
        default:
          return true;
      }
    })
  );
}
