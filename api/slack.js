// api/slack.js
// Slack の app_mention を受けて、キーワードを判定して返信する

// ---------------- 台帳データ（Excelから移す部分） ----------------
const FLYERS = [
  {
    id: 1,
    propertyName: "ジェイグラン平和",
    style: "ファミリー",
    target: "ファミリー",
    layout: "3LDK",
    copy: "ZEH-M認定",
    url: "https://yellkyushu-my.sharepoint.com/...（Excelのurl列）",
    updated: "2024_04",
  },
  {
    id: 2,
    propertyName: "ジェイグラン平和",
    style: "高級感",
    target: "高所得者",
    layout: "2LDK",
    copy: "先着順",
    url: "https://yellkyushu-my.sharepoint.com/...（Excelのurl列）",
    updated: "2024_06",
  },
];

// ================================================================
// 本体
// ================================================================
module.exports = async (req, res) => {
  let body = req.body;

  // body が文字列の時もある→パースする
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

  // URL Verification
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // Event Callback
  if (body.type === "event_callback") {
    const event = body.event || {};

    // bot のメッセージは無視
    if (event.subtype === "bot_message") {
      return res.status(200).json({ ok: true });
    }

    // app_mention（メンションされた）
    if (event.type === "app_mention") {
      // Slack 的にまず 200 を返す（3秒制限回避）
      res.status(200).json({ ok: true });

      // ---------------- ユーザー入力 ----------------
      let text = event.text || "";
      text = text.replace(/<@[^>]+>/g, "").trim();
      console.log("User text:", text);

      // ---------------- タグ判定 ----------------
      const matchedTags = detectTags(text);

      // ---------------- 台帳フィルタ ----------------
      const hitFlyers = filterFlyersByTags(matchedTags);

      // ---------------- 返信メッセージ作成 ----------------
      let reply;

      if (matchedTags.length === 0) {
        reply =
          "キーワードがうまく読み取れませんでした 🤔\n\n" +
          "例えば：\n" +
          "・ポップなチラシを探して\n" +
          "・ファミリー向けのチラシを探して\n" +
          "・3LDKを訴求しているチラシを探して";
      } else if (hitFlyers.length === 0) {
        reply =
          "次の条件で検索しましたが、該当するチラシはありませんでした。\n\n" +
          matchedTags.map((t) => `・${t.jaLabel}`).join("\n");
      } else {
        const top = hitFlyers.slice(0, 3);

        reply =
          "次の条件でチラシ候補を見つけました 🔍\n" +
          matchedTags.map((t) => `・${t.jaLabel}`).join("\n") +
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

      // ---------------- Slack に返信 ----------------
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

        const result = await response.json();
        console.log("Slack API response:", result);
      } catch (e) {
        console.error("Slack postMessage error:", e);
      }
    }
  }

  return res.status(200).json({ ok: true });
};

// ================================================================
// タグ判定ロジック
// ================================================================
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

  return rules.filter((rule) =>
    rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))
  );
}

// ================================================================
// 台帳フィルタロジック
// ================================================================
function filterFlyersByTags(tags) {
  if (!tags || tags.length === 0) return [];

  return FLYERS.filter((row) => {
    return tags.every((tag) => {
      switch (tag.id) {
        case "pop":
          return row.style && row.style.includes("ポップ");
        case "family":
          return row.target && row.target.includes("ファミリー");
        case "3ldk":
          return row.layout && row.layout.toUpperCase().includes("3LDK");
        default:
          return true;
      }
    });
  });
}
