import type { SupabaseClient } from "@supabase/supabase-js";
import { habitStatuses, saveJournal, getJournal, setHabitDone, type HabitStatus } from "@/lib/db/life";
import { setPendingAction, type BotUser } from "@/lib/db/meals";
import { MOODS, moodEmoji } from "@/lib/journal/mood";
import { localDateString } from "@/lib/time/day";
import { answerCallback, editMessage, escapeHtml, sendForceReply, sendMessage, type InlineKeyboard } from "./api";

const todayFor = (user: BotUser) => localDateString(new Date(), user.timezone);

// ───────────── habits ─────────────
function habitsView(statuses: HabitStatus[], date: string): { text: string; keyboard: InlineKeyboard } {
  const due = statuses.filter((h) => h.scheduled);
  const done = due.filter((h) => h.done).length;
  const lines = due.map((h) => `${h.done ? "✅" : "⬜"} ${h.emoji} ${escapeHtml(h.name)}${h.streak > 1 ? ` · 🔥${h.streak}` : ""}`);
  const text = `🌿 <b>Today's habits</b> — ${done}/${due.length} done\n\n${lines.join("\n")}${done === due.length ? "\n\n🎉 All done — lovely." : ""}`;
  const keyboard = due.map((h) => [{ text: `${h.done ? "✅" : "⬜"} ${h.emoji} ${h.name}`.slice(0, 40), callback_data: `h|${h.id}|${date}` }]);
  return { text, keyboard };
}

export async function showHabits(db: SupabaseClient, user: BotUser) {
  const date = todayFor(user);
  const statuses = await habitStatuses(db, user.user_id, date);
  if (!statuses.length) return void (await sendMessage(user.chat_id, "No habits yet. Add some on the dashboard (Habits tab), then tick them off here with /habits."));
  if (!statuses.some((h) => h.scheduled)) return void (await sendMessage(user.chat_id, "Nothing scheduled for today — enjoy the rest day 🌿"));
  const { text, keyboard } = habitsView(statuses, date);
  await sendMessage(user.chat_id, text, keyboard);
}

export async function toggleHabitCallback(db: SupabaseClient, user: BotUser, chatId: number, messageId: number, callbackId: string, habitId: string, date: string) {
  // only today's date (in the user's timezone) can be toggled from the bot, so old messages can't rewrite history
  if (date !== todayFor(user)) return void (await answerCallback(callbackId, "That list is from an earlier day — send /habits again."));
  try {
    const now = await setHabitDone(db, user.user_id, habitId, date);
    const { text, keyboard } = habitsView(await habitStatuses(db, user.user_id, date), date);
    await editMessage(chatId, messageId, text, keyboard);
    await answerCallback(callbackId, now ? "Done ✅" : "Unmarked");
  } catch {
    await answerCallback(callbackId, "Couldn't update that habit.");
  }
}

// ───────────── journal ─────────────
export async function startJournal(db: SupabaseClient, user: BotUser, text: string) {
  const date = todayFor(user);
  if (text.trim()) {
    await saveJournal(db, user.user_id, date, { notes: text });
    return void (await sendMessage(user.chat_id, "📓 Saved to today's journal."));
  }
  const existing = await getJournal(db, user.user_id, date);
  const keyboard: InlineKeyboard = [MOODS.map((m) => ({ text: `${m.emoji} ${m.label}`, callback_data: `j|${m.value}|${date}` }))];
  const head = existing?.mood ? `You marked today ${moodEmoji(existing.mood)}. Change it?` : "How was your day?";
  await sendMessage(user.chat_id, `📓 <b>${head}</b>`, keyboard.flatMap((row) => [row.slice(0, 3), row.slice(3)]));
}

export async function moodCallback(db: SupabaseClient, user: BotUser, chatId: number, messageId: number, callbackId: string, mood: number, date: string) {
  if (!Number.isInteger(mood) || mood < 1 || mood > 5 || date !== todayFor(user)) return void (await answerCallback(callbackId, "That prompt is out of date — send /journal again."));
  await saveJournal(db, user.user_id, date, { mood });
  await editMessage(chatId, messageId, `📓 Mood saved ${moodEmoji(mood)}`);
  await answerCallback(callbackId, "Saved");
  const promptId = await sendForceReply(chatId, "Want to add a note? <b>Reply to this message</b> — use #tags if you like. Or just ignore it.", "What stood out today?");
  await setPendingAction(db, user.user_id, { type: "journal_note", date, prompt_id: promptId });
}

/** Saves a reply to the journal prompt. Returns true if the message was consumed as a note. */
export async function saveJournalReply(db: SupabaseClient, user: BotUser, text: string, replyToId: number | undefined): Promise<boolean> {
  const pending = user.pending_action;
  if (pending?.type !== "journal_note" || replyToId !== pending.prompt_id) return false;
  await saveJournal(db, user.user_id, pending.date, { notes: text });
  await setPendingAction(db, user.user_id, null);
  await sendMessage(user.chat_id, "📓 Note saved. Thank you for checking in 🙏");
  return true;
}
