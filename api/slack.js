const { google } = require("googleapis");

async function loadSheetData() {
  try {
    const sheetUrl = process.env.SHEET_URL;

    // スプレッドシートIDをURLから抽出
    const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      console.error("Invalid SHEET_URL");
      return [];
    }
    const sheetId = match[1];

    // サービスアカウント認証
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // シート読み込み（1行目ヘッダー想定）
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "シート1!A1:Z1000", // ←台帳の範囲に合わせて調整
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) return [];

    // 1行目ヘッダー
    const headers = rows[0];

    // データ行をオブジェクト化
    const list = rows.slice(1).map((row) => {
      const item = {};
      headers.forEach((h, i) => {
        item[h] = row[i] || "";
      });
      return item;
    });

    console.log("Loaded sheet rows:", list.length);
    return list;

  } catch (err) {
    console.error("Google Sheets Load Error:", err);
    return [];
  }
}


// -------------------- メイン関数（Slack エンドポイント） --------------------
module.exports = async (req, res) => {
  let body = req.body;

  // body が文字列のときは JSON としてパース
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      console.error("JSON parse error:", err);
      return res.status(200).json({ ok: false });
    }
  }

  body = body || {};
  console.log("Slack request body:", JSON.stringify(body, null, 2));

  // 1) URL 認証
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  // 2) 通常イベント
  if (body.type === "event_callback") {
    const event = body.event || {};

    // Bot 自身のメッセージは無視
    if (event.subtype === "bot_message") {
      return res.status(200).json({ ok: true });
    }

    // メンションを受信したとき
    if (event.type === "app_mention") {
      const sheetRows = await loadSheetData();
const FLYERS = sheetRows.map((row, i) => ({
  id: i + 1,
  propertyName: row["物件名"],
  style: row["style"],
  target: row["target"],
  layout: row["layout"],
  copy: row["copy"],
  url: row["URL"],
  updated: row["更新日"],
  keywords: row["keyword"] ? row["keyword"].split(",") : [],
}));

      // ------------- ユーザー文を整形 -------------
      let text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
      console.log("User text:", text);

      // ------------- ① タグ判定 -------------
      const matchedTags = detectTags(text);

      // ------------- ② 探し方を決定 -------------
let hitFlyers = [];
let matchedKeywords = [];

// どのキーワードがヒットしたか（表示用）
matchedKeywords = collectMatchedKeywords(text);

if (matchedTags.length > 0) {
  // まずはタグ条件で絞り込み
  hitFlyers = filterFlyersByTags(matchedTags);

  // タグでは0件だったが、キーワードにはヒットしている場合は
  // 「キーワード全文検索」にフォールバック
  if (hitFlyers.length === 0 && matchedKeywords.length > 0) {
    hitFlyers = searchFlyersByKeywords(text);
  }
} else {
  // タグが一つも取れない場合は、最初からキーワード全文検索
  hitFlyers = searchFlyersByKeywords(text);
}


      // ------------- ③ 返信メッセージを組み立て -------------
      let reply = "";

      if (matchedTags.length === 0 && matchedKeywords.length === 0) {
        // まったく何も拾えなかったとき
        reply =
          "キーワードがうまく読み取れませんでした 🤔\n\n" +
          "例えば、次のように話しかけてください 👇\n" +
          "・ポップなチラシを探して\n" +
          "・ファミリー向けのチラシを探して\n" +
          "・3LDKを訴求しているチラシを探して";
      } else if (hitFlyers.length === 0) {
        // 条件は解釈できたが、台帳に該当行がない
        reply = "次の条件でチラシを探しましたが、該当する台帳がありませんでした。\n\n";

        if (matchedTags.length > 0) {
          reply +=
            "タグ条件:\n" +
            matchedTags.map((t) => `・${t.jaLabel}`).join("\n") +
            "\n\n";
        }
        if (matchedKeywords.length > 0) {
          reply +=
            "キーワード一致:\n" +
            matchedKeywords.map((k) => `・${k}`).join("\n");
        }
      } else {
        // 候補が見つかったとき
        const top = hitFlyers.slice(0, 3); // 最大3件

        reply = "次の条件でチラシ候補を見つけました 🔍\n";

        if (matchedTags.length > 0) {
          reply +=
            "タグ条件:\n" +
            matchedTags.map((t) => `・${t.jaLabel}`).join("\n") +
            "\n\n";
        }
        if (matchedKeywords.length > 0) {
          reply +=
            "キーワード一致:\n" +
            matchedKeywords.map((k) => `・${k}`).join("\n") +
            "\n\n";
        }

        reply +=
          "候補一覧（最大3件）：\n" +
          top
            .map(
              (row, idx) =>
                `${idx + 1}. ${row.propertyName} / ${row.layout}\n` +
                `   ${row.copy || ""}\n` +
                `   ${row.url}`
            )
            .join("\n\n");
      }

      // ------------- ④ Slack に返信 -------------
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

      // Slack への HTTP レスポンス
      return res.status(200).json({ ok: true });
    }
  }

  // それ以外のイベントは何もしない
  return res.status(200).json({ ok: true });
};

// -------------------- タグ判定ロジック --------------------
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
    if (hit) matched.push(rule);
  }

  return matched;
}

// -------------------- keyword 列の全文検索 --------------------
function searchFlyersByKeywords(text) {
  const lower = text.toLowerCase();

  return FLYERS.filter((row) => {
    if (!row.keywords || row.keywords.length === 0) return false;
    return row.keywords.some((kw) => lower.includes(kw.toLowerCase()));
  });
}

// どのキーワードがヒットしたか（表示用）
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

// -------------------- タグによる台帳フィルタ --------------------
function filterFlyersByTags(tags) {
  if (!tags || tags.length === 0) return [];

  return FLYERS.filter((row) =>
    tags.every((tag) => {
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
    })
  );
}
