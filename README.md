# Flyer Index（他社販促物ライブラリ）

管理シート（Googleスプレッドシート「slack-flyer-search」）を読み込み、他社の販促物を言葉・雰囲気・色・目的で検索する社内ツール。

- 画面：`pages/index.js`（検索・詳細・ボード）
- 言葉→条件の変換、検索、似ている資料：`lib/search.js`
- シート読み込み：`lib/sheet.js`（60秒キャッシュ）
- 環境変数（Vercelに登録。**リポジトリには絶対に入れない**）：`SHEET_URL`、`GOOGLE_SERVICE_ACCOUNT`、任意で `SHEET_RANGE`（既定 `A:AA`）

旧システム（Slack／LINE／LINE WORKS連携を含む）は `legacy-line-slack` ブランチに保存。
