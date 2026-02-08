export async function GET() {
  return Response.json({
    hasAccessToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
    hasChannelSecret: !!process.env.LINE_CHANNEL_SECRET,
  });
}
