import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export type InlineKeyboard = { text: string; callback_data: string }[][];

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env.telegramToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description}`);
  return json.result;
}

export async function sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<number> {
  const msg = await call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
  return msg.message_id;
}

/** Opens Telegram's reply UI so the user's next message is explicitly a reply to this prompt. */
export async function sendForceReply(chatId: number, text: string, placeholder: string): Promise<number> {
  const msg = await call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { force_reply: true, input_field_placeholder: placeholder, selective: true },
  });
  return msg.message_id;
}

export async function editMessage(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) {
  try {
    await call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  } catch (e) {
    if (!String(e).includes("message is not modified")) throw e;
  }
}

export async function answerCallback(callbackId: string, text?: string) {
  await call("answerCallbackQuery", { callback_query_id: callbackId, text });
}

export async function setWebhook(url: string) {
  return call("setWebhook", {
    url,
    secret_token: env.telegramWebhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

/** Constant-time check of Telegram's X-Telegram-Bot-Api-Secret-Token header. */
export function verifyWebhookSecret(header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(env.telegramWebhookSecret());
  return a.length === b.length && timingSafeEqual(a, b);
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
