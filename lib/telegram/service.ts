import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autoConfirmStale, confirmedLogsForDay, createLog, deleteLog, getBotUser, getLog, lastLog, loadCatalog, loadDefaults,
  recomputeTotal, redeemLinkCode, saveDefault, setLogMessageId, setLogStatus, setPendingAction, updateItem,
  type BotUser, type LogItem, type MealLog, type NewItem,
} from "@/lib/db/meals";
import { env } from "@/lib/env";
import { parseMealText } from "@/lib/llm/parser";
import { estimatedItem, itemFromResolution, matchedItem, variantLabel } from "@/lib/nutrition/build";
import { candidatesFor, resolveItem, type Food } from "@/lib/nutrition/matcher";
import { mealTypeForHour, localHour } from "@/lib/time/day";
import { answerCallback, editMessage, sendMessage, escapeHtml } from "./api";
import { HELP, itemPicker, logKeyboard, logMessage, todayMessage } from "./format";
import { moodCallback, saveJournalReply, showHabits, startJournal, toggleHabitCallback } from "./life";
import { healthRange } from "@/lib/db/life";
import { dailyBalance } from "@/lib/health/balance";
import { localDateString } from "@/lib/time/day";

export interface TgUpdate {
  message?: { message_id: number; chat: { id: number }; text?: string; from?: { first_name?: string }; reply_to_message?: { message_id: number } };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
}

const NOT_LINKED =
  "Namaste 🙏 I'm not linked to a Life OS account yet.\nSign in on the website, copy your one-time code, then send <code>/start YOURCODE</code> here.";

export async function handleUpdate(db: SupabaseClient, update: TgUpdate) {
  if (update.message?.text) return handleText(db, update.message.chat.id, update.message.text.trim(), update.message.reply_to_message?.message_id);
  if (update.callback_query?.data && update.callback_query.message) {
    const { id, data, message } = update.callback_query;
    return handleCallback(db, message.chat.id, message.message_id, id, data!);
  }
}

// ───────────────────────── text ─────────────────────────
async function handleText(db: SupabaseClient, chatId: number, text: string, replyToId?: number) {
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.startsWith("/") ? cmdRaw.split("@")[0].toLowerCase() : null;

  if (cmd === "/start") {
    if (rest[0]) {
      const userId = await redeemLinkCode(db, rest[0], chatId);
      if (!userId) return void (await sendMessage(chatId, "That code is invalid or expired. Generate a fresh one on the website (they last 15 minutes)."));
      await sendMessage(chatId, `🪔 <b>Linked!</b> Welcome to Life OS.\n\n${HELP}`);
      return;
    }
    const user = await getBotUser(db, chatId);
    return void (await sendMessage(chatId, user ? `Welcome back${user.display_name ? ", " + escapeHtml(user.display_name) : ""} 🙏\n\n${HELP}` : NOT_LINKED));
  }

  const user = await getBotUser(db, chatId);
  if (!user) return void (await sendMessage(chatId, NOT_LINKED));
  await autoConfirmStale(db, user.user_id, env.autoConfirmMinutes());

  if (cmd === "/help") return void (await sendMessage(chatId, HELP));
  if (cmd === "/today") return today(db, user);
  if (cmd === "/undo") return undo(db, user);
  if (cmd === "/target") return setTarget(db, user, rest[0]);
  if (cmd === "/habits") return showHabits(db, user);
  if (cmd === "/journal" || cmd === "/note") return startJournal(db, user, rest.join(" "));
  if (cmd) return void (await sendMessage(chatId, HELP));

  // a reply to the journal prompt is a journal note, never a meal
  if (await saveJournalReply(db, user, text, replyToId)) return;

  // awaiting a typed quantity from ✏️?
  if (user.pending_action?.type === "edit_qty") {
    const q = parseQuantity(text);
    if (q != null) return applyTypedQuantity(db, user, user.pending_action, q);
    await setPendingAction(db, user.user_id, null); // not a number: treat as a fresh meal message
  }
  return logMeal(db, user, text);
}

export function parseQuantity(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (/^(half|aadha|aadhaa|आधा|ಅರ್ಧ|సగం)$/.test(t)) return 0.5;
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac && Number(frac[2]) > 0) return Number(frac[1]) / Number(frac[2]);
  const n = t.match(/^(\d+(?:\.\d+)?)\b/);
  const v = n ? Number(n[1]) : null;
  return v && v > 0 && v <= 100 ? v : null;
}

async function logMeal(db: SupabaseClient, user: BotUser, text: string) {
  const [catalog, defaults] = await Promise.all([loadCatalog(db, user.user_id), loadDefaults(db, user.user_id)]);
  let parsed;
  try {
    parsed = await parseMealText(text, [...new Set(catalog.filter((f) => f.source !== "ifct2017").map((f) => f.food_key))]);
  } catch (e) {
    console.error("parse failed", e);
    return void (await sendMessage(user.chat_id, "Sorry, I couldn't read that one. Could you rephrase it? e.g. <i>“2 idli and a filter coffee”</i>"));
  }
  if (!parsed.is_food_log || !parsed.items.length) {
    return void (await sendMessage(user.chat_id, "I log meals — tell me what you ate, like <i>“2 dosa and filter coffee”</i>. /help lists what I can do."));
  }

  const items: NewItem[] = [];
  const failed: string[] = [];
  for (const p of parsed.items) {
    const item = await itemFromResolution(p, resolveItem(p, catalog, defaults), items.length);
    if (item) items.push(item);
    else failed.push(p.display_name);
  }
  if (!items.length) return void (await sendMessage(user.chat_id, `I couldn't work out nutrition for ${failed.map(escapeHtml).join(", ")}. Try naming the dish more specifically.`));

  const mealType = parsed.meal_type ?? mealTypeForHour(localHour(new Date(), user.timezone));
  const log = await createLog(db, { userId: user.user_id, rawText: text, mealType, items });
  const note = failed.length ? `\n\n⚠️ Skipped (couldn't price): ${failed.map(escapeHtml).join(", ")}` : "";
  const msgId = await sendMessage(user.chat_id, logMessage(log) + note, logKeyboard(log));
  await setLogMessageId(db, log.id, msgId);
}

// ───────────────────────── commands ─────────────────────────
async function today(db: SupabaseClient, user: BotUser) {
  const logs = await confirmedLogsForDay(db, user.user_id, user.timezone);
  const date = localDateString(new Date(), user.timezone);
  const [health] = await healthRange(db, user.user_id, date, date);
  const eaten = Math.round(logs.reduce((s, l) => s + Number(l.total_kcal), 0));
  const balance = dailyBalance({ eaten, activeKcal: health?.active_kcal ?? null, restingKcal: health?.resting_kcal ?? null });
  await sendMessage(user.chat_id, todayMessage({ name: user.display_name, logs, target: user.calorie_target, balance }));
}

async function undo(db: SupabaseClient, user: BotUser) {
  const log = await lastLog(db, user.user_id);
  if (!log) return void (await sendMessage(user.chat_id, "Nothing to undo."));
  await deleteLog(db, user.user_id, log.id);
  if (log.telegram_message_id) await editMessage(user.chat_id, log.telegram_message_id, "🗑 <i>Removed.</i>");
  await sendMessage(user.chat_id, `Removed your last log (${Math.round(log.total_kcal)} kcal): ${log.items.map((i) => escapeHtml(i.name)).join(", ")}.`);
}

async function setTarget(db: SupabaseClient, user: BotUser, arg?: string) {
  const n = Number(arg);
  if (!Number.isInteger(n) || n < 500 || n > 10000) return void (await sendMessage(user.chat_id, "Send it like <code>/target 2000</code> (kcal per day, 500–10000)."));
  const { error } = await db.from("profiles").update({ calorie_target: n }).eq("id", user.user_id);
  if (error) throw new Error(error.message);
  await sendMessage(user.chat_id, `Daily target set to <b>${n.toLocaleString("en-IN")} kcal</b>.`);
}

// ───────────────────────── callbacks ─────────────────────────
async function handleCallback(db: SupabaseClient, chatId: number, messageId: number, callbackId: string, data: string) {
  const user = await getBotUser(db, chatId);
  if (!user) return void (await answerCallback(callbackId));
  const [action, logId, posRaw, extra] = data.split("|");
  const pos = Number(posRaw);

  // habits ("h|habitId|date") and mood ("j|1-5|date") aren't tied to a meal log
  if (action === "h") return toggleHabitCallback(db, user, chatId, messageId, callbackId, logId, posRaw);
  if (action === "j") return moodCallback(db, user, chatId, messageId, callbackId, Number(logId), posRaw);

  const log = await getLog(db, user.user_id, logId);
  if (!log) return void (await answerCallback(callbackId, "This log no longer exists."));
  if (log.status !== "pending") return void (await answerCallback(callbackId, log.status === "confirmed" ? "Already saved." : "This log expired."));

  const catalog = await loadCatalog(db, user.user_id);
  const render = async (l: MealLog, extraText = "") => {
    await editMessage(chatId, messageId, logMessage(l) + extraText, logKeyboard(l));
  };

  switch (action) {
    case "ok": {
      if (log.items.some((i) => i.match_type === "unresolved")) return void (await answerCallback(callbackId, "Please answer the question first."));
      await setLogStatus(db, user.user_id, log.id, "confirmed");
      const day = await confirmedLogsForDay(db, user.user_id, user.timezone);
      const eaten = Math.round(day.reduce((s, l) => s + Number(l.total_kcal), 0));
      await editMessage(chatId, messageId, `${logMessage({ ...log, status: "confirmed" })}\nToday so far: ${eaten.toLocaleString("en-IN")} kcal`);
      return void (await answerCallback(callbackId, "Saved ✅"));
    }
    case "del": {
      await deleteLog(db, user.user_id, log.id);
      await editMessage(chatId, messageId, "🗑 <i>Removed.</i>");
      return void (await answerCallback(callbackId, "Removed"));
    }
    case "back": {
      await render(log);
      return void (await answerCallback(callbackId));
    }
    case "eq":
    case "ev": {
      if (pos < 0 && log.items.length > 1) {
        await editMessage(chatId, messageId, `${logMessage(log)}\n\n<b>Which item?</b>`, itemPicker(log, action));
        return void (await answerCallback(callbackId));
      }
      const item = log.items.find((i) => i.position === (pos < 0 ? 0 : pos))!;
      if (action === "eq") {
        await setPendingAction(db, user.user_id, { type: "edit_qty", log_id: log.id, position: item.position });
        await sendMessage(chatId, `How many <b>${escapeHtml(item.name)}</b>? Reply with a number (e.g. <code>2</code> or <code>1.5</code>).`);
        return void (await answerCallback(callbackId));
      }
      const options = candidatesFor(catalog, { food_key: item.food_key, display_name: item.name });
      if (options.length < 2) return void (await answerCallback(callbackId, "No other variants for this one."));
      await updateItem(db, user.user_id, item.id, {
        match_type: "unresolved",
        clarify: { kind: "variant", options: options.map((f) => ({ food_id: f.id, label: variantLabel(f) })) },
      });
      await render((await recomputeTotal(db, (await getLog(db, user.user_id, log.id))!)));
      return void (await answerCallback(callbackId));
    }
    case "v": {
      const item = log.items.find((i) => i.position === pos);
      const opt = item?.clarify?.kind === "variant" ? item.clarify.options[Number(extra)] : undefined;
      const food = opt && catalog.find((f) => f.id === opt.food_id);
      if (!item || !food) return void (await answerCallback(callbackId, "Option expired."));
      if (item.clarify?.kind === "variant" && item.clarify.qty_known === false) {
        // quantity was never stated: use the saved default if there is one, otherwise ask — never assume 1
        const saved = (await loadDefaults(db, user.user_id)).find((d) => d.food_key === food.food_key && d.food_id === food.id);
        if (saved) await applyFood(db, user, item, food, saved.quantity, item.unit);
        else await updateItem(db, user.user_id, item.id, { food_id: food.id, food_key: food.food_key, name: food.name, variant: food.variant, clarify: { kind: "quantity" } });
      } else {
        await applyFood(db, user, item, food, item.quantity, item.unit);
      }
      await render(await recomputeTotal(db, log));
      return void (await answerCallback(callbackId, `${food.name} ✓`));
    }
    case "q": {
      const item = log.items.find((i) => i.position === pos);
      if (!item) return void (await answerCallback(callbackId));
      await applyQuantity(db, user, item, catalog, Number(extra));
      await render(await recomputeTotal(db, log));
      return void (await answerCallback(callbackId));
    }
  }
  await answerCallback(callbackId);
}

// ───────────────────────── mutations (each saves what it learned as the user's default) ─────────────────────────
async function applyFood(db: SupabaseClient, user: BotUser, item: LogItem, food: Food, quantity: number, unit: string) {
  const priced = matchedItem(food, quantity, unit, item.position);
  await updateItem(db, user.user_id, item.id, { ...priced, clarify: null });
  await saveDefault(db, user.user_id, { food_key: food.food_key, food_id: food.id, quantity });
}

async function applyQuantity(db: SupabaseClient, user: BotUser, item: LogItem, catalog: Food[], quantity: number) {
  const food = item.food_id ? catalog.find((f) => f.id === item.food_id) : undefined;
  if (food) return applyFood(db, user, item, food, quantity, item.unit);

  // no database row: re-estimate, still flagged as estimated
  const priced = await estimatedItem({ food_key: item.food_key, display_name: item.name, variant: item.variant, quantity, unit: item.unit }, quantity, item.position);
  if (!priced) {
    await updateItem(db, user.user_id, item.id, { quantity, match_type: "unresolved", clarify: { kind: "quantity" } });
    return;
  }
  await updateItem(db, user.user_id, item.id, { ...priced, clarify: null });
}

async function applyTypedQuantity(db: SupabaseClient, user: BotUser, action: Extract<NonNullable<BotUser["pending_action"]>, { type: "edit_qty" }>, quantity: number) {
  await setPendingAction(db, user.user_id, null);
  const log = await getLog(db, user.user_id, action.log_id);
  const item = log?.items.find((i) => i.position === action.position);
  if (!log || !item || log.status !== "pending") return void (await sendMessage(user.chat_id, "That log is no longer editable."));
  await applyQuantity(db, user, item, await loadCatalog(db, user.user_id), quantity);
  const updated = await recomputeTotal(db, log);
  if (log.telegram_message_id) await editMessage(user.chat_id, log.telegram_message_id, logMessage(updated), logKeyboard(updated));
  await sendMessage(user.chat_id, `Updated to ${quantity} × ${escapeHtml(item.name)} — I'll remember that for next time.`);
}
