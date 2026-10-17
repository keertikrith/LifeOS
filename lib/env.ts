/** Lazy, validated env access. Nothing is read at import time so `next build` works without secrets. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  geminiApiKey: () => required("GEMINI_API_KEY"),
  geminiModel: () => required("GEMINI_MODEL"),
  telegramToken: () => required("TELEGRAM_BOT_TOKEN"),
  telegramBotUsername: () => process.env.TELEGRAM_BOT_USERNAME ?? "",
  telegramWebhookSecret: () => required("TELEGRAM_WEBHOOK_SECRET"),
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  autoConfirmMinutes: () => Number(process.env.AUTO_CONFIRM_MINUTES ?? "10"),
};
