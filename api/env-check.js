// pages/api/env-check.js
export default function handler(req, res) {
  const hasAccessToken = !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const hasChannelSecret = !!process.env.LINE_CHANNEL_SECRET;

  // 値は返さず「存在するかどうか」だけ返す
  res.status(200).json({
    hasAccessToken,
    hasChannelSecret,
  });
}
