// Registers the Telegram webhook with the secret token.
// Usage: node --env-file=.env.local scripts/set-webhook.mjs https://your-public-url
const base = process.argv[2];
if (!base?.startsWith("https://")) {
  console.error("Usage: node --env-file=.env.local scripts/set-webhook.mjs https://<public-https-url>");
  process.exit(1);
}
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret } = process.env;
if (!token || token.startsWith("PASTE") || !secret) {
  console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local first.");
  process.exit(1);
}
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${base.replace(/\/$/, "")}/api/telegram`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});
console.log(await res.json());
