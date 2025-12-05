// api/slack.js

const { google } = require("googleapis");

// スプレッドシートから読み込んだ台帳をここに保持する
let FLYERS = [];

/**
 * Google スプレッドシートから台帳データを読み込む
 */
async function loadSheetData() {
  try {
    const sheetUrl = process.env.SHEET_URL;
    if (!sheetUrl) {
      console.error("SHEET_URL is not set");
      return [];
    }

    // URL から spreadsheetId を抽出
    const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      console.error("Invalid SHEET_URL:", sheetUrl);
      return [];
    }
    const sheetId = match[1];

    // サービスアカウント JSON を環境変数から取得
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // ★シート名は一番左のシートを想定して "A1:Z1000" にしています
    // もし名前付きシートを指定したい場合は "シート1!A1:Z1000" などに変更
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "A1:Z1000",
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      console.log("Sheet has no rows");
      return [];
    }

    const headers = rows[0];
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

// -------------------- Slack エンドポイント --------------------
module.exports = async (req, res) => {
  let body = req.body;

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

  // URL 認証
  if (body.type === "url_verification") {
    return res.status(200).send(body.challenge);
  }

  if (body.type === "event_callback") {
    const event = body.event || {};

    // Bot 自身のメッセージは無視
    if (event.subtype === "bot_message") {
      return res.status(200).json({ ok: true });
    }

    // メンション受信
    if (event.type === "app_mention") {
      // 1) スプレッドシートから最新の台帳を読み込み
      const sheetRows = await loadSheetData();

      if (!sheetRows || sheetRows.length === 0) {
        console.log("Sheet rows empty, reply with guidance");
        const reply =
          "台帳が空のようです 🤔\n" +
          "スプレッドシートに物件データを入力してから、もう一度試してください。";

        await postToSlack(event.channel, reply);
        return res.status(200).json({ ok: true });
      }

      // 2) 台帳を FLYERS に反映（ヘッダー名に合わせてマッピング）
      FLYERS = sheetRows.map((row, idx) => ({
        id: row["id"] || String(idx + 1),
        propertyName: row["property_name"] || "",
        style: row["style"] || "",
        target: row["target"] || "",
        layout: row["layout"] || "",
        copy: row["copy"] || "",
        url: row["url"] || "",
        updated: row["updated"] || "",
        keywords: (row["keyword"] || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }));
      console.log("FLYERS loaded:", FLYERS.length);
      console.log("FLYERS[0]:", FLYERS[0]);

      // 3) ユーザー発言を整形
      let text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
      console.log("User text:", text);

      // 4) タグ判定 & キーワードマッチ
      const matchedTags = detectTags(text);
      const matchedKeywords = collectMatchedKeywords(text);

      let hitFlyers = [];

      if (matchedTags.length > 0) {
        hitFlyers = filterFlyersByTags(matchedTags);
        console.log(
          "filterFlyersByTags hits:",
          hitFlyers.length,
          "tags:",
          matchedTags.map((t) => t.id)
        );

        if (hitFlyers.length === 0 && matchedKeywords.length > 0) {
          hitFlyers = searchFlyersByKeywords(text);
          console.log("fallback searchFlyersByKeywords hits:", hitFlyers.length);
        }
      } else {
        hitFlyers = searchFlyersByKeywords(text);
        console.log("searchFlyersByKeywords hits:", hitFlyers.length);
      }

      // 5) 返信メッセージ生成
      let reply = "";

      if (matchedTags.length === 0 && matchedKeywords.length === 0) {
        reply =
          "キーワードがうまく読み取れませんでした 🤔\n\n" +
          "例えば、次のように話しかけてください 👇\n" +
          "・ポップなチラシを探して\n" +
          "・ファミリー向けのチラシを探して\n" +
          "・3LDKを訴求しているチラシを探して";
      } else if (hitFlyers.length === 0) {
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
        const top = hitFlyers.slice(0, 3);

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

      await postToSlack(event.channel, reply);
      return res.status(200).json({ ok: true });
    }
  }

  return res.status(200).json({ ok: true });
};

/**
 * Slack にメッセージを送信するヘルパー
 */
async function postToSlack(channel, text) {
  try {
    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({ channel, text }),
    });
    const result = await resp.json();
    console.log("Slack API response:", result);
  } catch (err) {
    console.error("Slack postMessage error:", err);
  }
}

// -------------------- タグ判定 --------------------
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

// -------------------- タグによるフィルタ --------------------
function filterFlyersByTags(tags) {
  if (!tags || tags.length === 0) return [];

  const filtered = FLYERS.filter((row) =>
    tags.every((tag) => {
      switch (tag.id) {
        case "pop":
          // style が "pop" でも「ポップ」でもヒットさせる
          return (
            row.style &&
            (row.style.includes("pop") || row.style.includes("ポップ"))
          );
        case "family":
          return row.target && row.target.includes("ファミリー");
        case "3ldk":
          return (
            row.layout &&
            row.layout.toUpperCase().includes("3LDK")
          );
        default:
          return true;
      }
    })
  );

  console.log(
    "filterFlyersByTags: tags=",
    tags.map((t) => t.id),
    " -> ",
    filtered.length,
    "hits"
  );
  return filtered;
}
