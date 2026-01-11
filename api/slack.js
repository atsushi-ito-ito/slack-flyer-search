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
      // ✅ id は廃止
      // ✅ copy は廃止
      // ✅ area / developer / file_name を追加
      FLYERS = sheetRows.map((row) => ({
        area: row["area"] || "", // A列: 地域区分
        prefectures: row["prefectures"] || "",         // ★追加
  　　　　municipalities: row["municipalities"] || "",   // ★追加
        propertyName: row["property_name"] || "",
        developer: row["developer"] || "",
        fileName: row["file_name"] || "", // M列: file_name（コード内は fileName）
        style: row["style"] || "",
        target: row["target"] || "",
        layout: row["layout"] || "", // layout を残す場合
        url: row["url"] || row["URL"] || "",
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

      console.log("DEBUG municipalities sample:", FLYERS.slice(0, 10).map(f => f.municipalities));

　　　 console.log("DEBUG query text:", text);

      // 4) タグ判定 & キーワードマッチ（※matchedKeywords は keyword 配列からのみ拾う）
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

        // タグで0件なら全文検索にフォールバック
        if (hitFlyers.length === 0) {
          hitFlyers = searchFlyersByKeywords(text);
          console.log("fallback searchFlyersByKeywords hits:", hitFlyers.length);
        }
      } else {
        hitFlyers = searchFlyersByKeywords(text);
        console.log("searchFlyersByKeywords hits:", hitFlyers.length);
      }

      // 5) 返信メッセージ生成
      let reply = "";

      // ✅ 「タグもkeyword一致もない」場合でも、全文検索でヒットしていれば案内ではなく結果を返す
      if (hitFlyers.length === 0) {
        // 何もヒットしないときだけ案内
        reply =
          "該当するチラシが見つかりませんでした 🤔\n\n" +
          "例えば、次のように話しかけてください 👇\n" +
          "・ポップなチラシを探して\n" +
          "・ファミリー向けのチラシを探して\n" +
          "・3LDKを訴求しているチラシを探して\n" +
          "・野村不動産のチラシを探して\n" +
          "・（物件名） のチラシを探して";

        await postToSlack(event.channel, reply);
        return res.status(200).json({ ok: true });
      }

      const top = hitFlyers.slice(0, 3);

      // ① テキスト版（フォールバック用）
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
          .map((row, idx) => {
            const titleParts = [];
            if (row.area) titleParts.push(row.area);
            if (row.propertyName) titleParts.push(row.propertyName);
            const title = titleParts.join(" / ") || "(物件名未設定)";

            const subParts = [];
            if (row.developer) subParts.push(`事業主:${row.developer}`);
            if (row.layout) subParts.push(row.layout);
            if (row.fileName) subParts.push(row.fileName);

            const sub = subParts.length ? `   ${subParts.join(" / ")}\n` : "";

            return `${idx + 1}. ${title}\n${sub}   ${row.url || ""}`.trimEnd();
          })
          .join("\n\n");

      // ② Block Kit 版（リッチなカードUI）
      const conditionLines = [];
      if (matchedTags.length > 0) {
        conditionLines.push(
          "*タグ条件:*\n" + matchedTags.map((t) => `・${t.jaLabel}`).join("\n")
        );
      }
      if (matchedKeywords.length > 0) {
        conditionLines.push(
          "*キーワード一致:*\n" + matchedKeywords.map((k) => `・${k}`).join("\n")
        );
      }

      const blocks = [];

      // ヘッダー
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: "チラシ候補 🔍",
        },
      });

      // 条件表示（タグ・キーワード）
      if (conditionLines.length > 0) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: conditionLines.join("\n\n"),
          },
        });
      }

      blocks.push({ type: "divider" });

      // 各候補をカード風に
      top.forEach((row, idx) => {
  // 1行目：都道府県 / 市区町村
  const locationLine = [row.prefectures, row.municipalities]
    .filter(Boolean)
    .join(" / ");

  // 2行目：物件名
  const propertyLine = row.propertyName || "(物件名未設定)";

  // 3行目：事業主
  const developerLine = row.developer
    ? `事業主：${row.developer}`
    : "";

  // 4行目：ファイル名
  const fileLine = row.fileName
    ? `📄 ${row.fileName}`
    : "";

  const lines = [
    locationLine,
    `*${propertyLine}*`,
    developerLine,
    fileLine,
  ].filter(Boolean);

  const section = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: lines.join("\n"),
    },
  };

  // URL がある場合のみボタンを付ける
  if (row.url) {
    section.accessory = {
      type: "button",
      text: {
        type: "plain_text",
        text: "PDFを開く",
      },
      url: row.url,
    };
  }

  blocks.push(section);

  if (idx < top.length - 1) {
    blocks.push({ type: "divider" });
  }
});


      // ✅ 二重投稿防止：blocks 付きで1回だけ送る
      await postToSlack(event.channel, reply, blocks);
      return res.status(200).json({ ok: true });
    }
  }

  return res.status(200).json({ ok: true });
};

/**
 * Slack にメッセージを送信するヘルパー
 * text はフォールバック用、blocks があればカードUIで表示
 */
async function postToSlack(channel, text, blocks) {
  try {
    const payload = { channel, text };

    // Block Kit（カードUI）が指定されている場合は blocks を付ける
    if (blocks && Array.isArray(blocks) && blocks.length > 0) {
      payload.blocks = blocks;
    }

    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify(payload),
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

  const lower = (text || "").toLowerCase();
  const matched = [];

  for (const rule of rules) {
    const hit = rule.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (hit) matched.push(rule);
  }
  return matched;
}

// -------------------- 全文検索（keyword + developer等） --------------------
function searchFlyersByKeywords(text) {
  const q = (text || "").toLowerCase().trim();
  if (!q) return [];

  return FLYERS.filter((row) => {
    const muni = String(row.municipalities || "").toLowerCase();
    const pref = String(row.prefectures || "").toLowerCase();
    const dev  = String(row.developer || "").toLowerCase();
    const prop = String(row.propertyName || "").toLowerCase();
    const area = String(row.area || "").toLowerCase();
    const file = String(row.fileName || "").toLowerCase();
    const style = String(row.style || "").toLowerCase();
    const target = String(row.target || "").toLowerCase();

    const keywords = Array.isArray(row.keywords) ? row.keywords : [];
    const hitKeyword = keywords.some((kw) => {
      const k = String(kw || "").toLowerCase();
      return q.includes(k) || k.includes(q);
    });

    const hitMuni = muni && (muni.includes(q) || q.includes(muni));
    const hitPref = pref && (pref.includes(q) || q.includes(pref));
    const hitDeveloper = dev && (dev.includes(q) || q.includes(dev));
    const hitProperty = prop && (prop.includes(q) || q.includes(prop));
    const hitArea = area && (area.includes(q) || q.includes(area));
    const hitFileName = file && (file.includes(q) || q.includes(file));
    const hitStyle = style && (style.includes(q) || q.includes(style));
    const hitTarget = target && (target.includes(q) || q.includes(target));

    return (
      hitMuni ||
      hitPref ||
      hitDeveloper ||
      hitProperty ||
      hitArea ||
      hitFileName ||
      hitStyle ||
      hitTarget ||
      hitKeyword
    );
  });
}


// どのキーワードがヒットしたか（表示用）※keyword列のみ
function collectMatchedKeywords(text) {
  const lower = (text || "").toLowerCase();
  const hitSet = new Set();

  FLYERS.forEach((row) => {
    (row.keywords || []).forEach((kw) => {
      if (lower.includes(String(kw).toLowerCase())) {
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
          // layout がある場合は layout、なければ keywords からも拾える
          if (row.layout && row.layout.toUpperCase().includes("3LDK")) return true;
          return (
            row.keywords &&
            row.keywords.some((kw) => String(kw).toUpperCase().includes("3LDK"))
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
