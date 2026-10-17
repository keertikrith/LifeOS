import { adminClient } from "@/lib/db/clients";
import { verifyWebhookSecret } from "@/lib/telegram/api";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/service";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    await handleUpdate(adminClient(), (await request.json()) as TgUpdate);
  } catch (e) {
    // Always 200: a non-2xx makes Telegram retry the same update repeatedly.
    console.error("telegram handler error", e);
  }
  return new Response("ok");
}
