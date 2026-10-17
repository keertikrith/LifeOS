import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCoach } from "@/lib/coach/load";
import type { BotUser } from "@/lib/db/meals";
import { addEvent, listEvents } from "@/lib/db/social";
import { logSession, addLifts, sessionForDate } from "@/lib/db/workouts";
import { hasSession } from "@/lib/db/workouts";
import { isoWeekday } from "@/lib/habits/schedule";
import { addDays, bankedFor, DEFAULT_ALLOWANCE, KIND_LABEL, monthUsage, parseWhen, type EventKind } from "@/lib/social/budget";
import { localDateString } from "@/lib/time/day";
import { parseLift } from "@/lib/workouts/stats";
import { answerCallback, escapeHtml, sendMessage } from "./api";

const todayFor = (u: BotUser) => localDateString(new Date(), u.timezone);
const prettyDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// ───────────── nudge controls ─────────────
/** /nudges on|off · /pause [hours] · /resume · /hours 7 22 */
export async function nudgeCommand(db: SupabaseClient, user: BotUser, cmd: string, args: string[]) {
  const save = async (patch: Record<string, unknown>) => { const { error } = await db.from("profiles").update(patch).eq("id", user.user_id); if (error) throw new Error(error.message); };
  if (cmd === "/nudges") {
    const on = args[0]?.toLowerCase();
    if (on !== "on" && on !== "off") return void (await sendMessage(user.chat_id, "Send <code>/nudges on</code> or <code>/nudges off</code>. /pause 24 mutes them for a day."));
    await save({ nudges_enabled: on === "on", paused_until: null });
    return void (await sendMessage(user.chat_id, on === "on" ? "Check-ins are on. I'll only message when there's something useful to say." : "Check-ins are off. /nudges on turns them back on."));
  }
  if (cmd === "/pause") {
    const h = Math.min(24 * 14, Math.max(1, Number(args[0] ?? 24) || 24));
    await save({ paused_until: new Date(Date.now() + h * 3_600_000).toISOString() });
    return void (await sendMessage(user.chat_id, `Paused for ${h} hour${h === 1 ? "" : "s"}. /resume brings them back sooner.`));
  }
  if (cmd === "/resume") {
    await save({ paused_until: null, nudges_enabled: true });
    return void (await sendMessage(user.chat_id, "Check-ins resumed."));
  }
  // /hours
  const [w, s] = args.map(Number);
  if (!Number.isInteger(w) || !Number.isInteger(s) || w < 0 || w > 23 || s < 1 || s > 24 || s <= w) return void (await sendMessage(user.chat_id, "Send it like <code>/hours 7 22</code> — the hours I may message you between (24-hour clock)."));
  await save({ wake_hour: w, sleep_hour: s });
  await sendMessage(user.chat_id, `I'll only check in between ${w}:00 and ${s}:00.`);
}

// ───────────── eating out / drinks ─────────────
/** /out [when] · /drinks [when] — when = today (default), tomorrow, a weekday, or YYYY-MM-DD */
export async function eventCommand(db: SupabaseClient, user: BotUser, kind: EventKind, args: string[]) {
  const today = todayFor(user);
  const date = parseWhen(args[0], today);
  if (!date || date < today) return void (await sendMessage(user.chat_id, `Send it like <code>/${kind === "out" ? "out" : "drinks"} sat</code> — when can be today, tomorrow, a weekday or YYYY-MM-DD.`));
  await addEvent(db, user.user_id, { date, kind, today, note: args.slice(1).join(" ") || undefined });
  const events = await listEvents(db, user.user_id, `${date.slice(0, 7)}-01`, `${date.slice(0, 7)}-31`);
  const used = monthUsage(events, date.slice(0, 7))[kind];
  const budget = kind === "out" ? user.monthly_out_budget : user.monthly_drink_budget;
  const label = KIND_LABEL[kind].toLowerCase();
  const lines = [`📅 Saved: <b>${label}</b> on ${prettyDate(date)}. That's ${used} of ${budget} planned this month${used > budget ? " — one over, which is completely fine; the weekly average is what counts" : ""}.`];
  if (user.calorie_target) {
    const banked = bankedFor(user.calorie_target, { date, kind, allowance_kcal: DEFAULT_ALLOWANCE[kind], created_on: today });
    if (banked > 0) lines.push(`I'll trim a little from each of the days before it (about ${Math.round(banked / 3)} kcal) and give you ${banked} kcal extra on the day.`);
    else lines.push("It's today, so there's no time to bank ahead — just log it as you go and the week will absorb it.");
  } else lines.push("Set a daily target (/target 2000) and I'll bank calories for it automatically.");
  await sendMessage(user.chat_id, lines.join("\n"));
}

export async function budgetCommand(db: SupabaseClient, user: BotUser) {
  const today = todayFor(user);
  const month = today.slice(0, 7);
  const events = await listEvents(db, user.user_id, `${month}-01`, `${month}-31`);
  const u = monthUsage(events, month);
  const upcoming = (await listEvents(db, user.user_id, today, addDays(today, 14))).map((e) => `• ${prettyDate(e.date)} — ${KIND_LABEL[e.kind].toLowerCase()}`);
  await sendMessage(user.chat_id, `🍽 <b>This month</b>\nEating out: ${u.out}/${user.monthly_out_budget}\nDrinks: ${u.drinks}/${user.monthly_drink_budget}${upcoming.length ? `\n\n<b>Coming up</b>\n${upcoming.join("\n")}` : ""}\n\nPlan one with /out sat or /drinks fri.`);
}

// ───────────── workouts ─────────────
async function plannedToday(db: SupabaseClient, user: BotUser) {
  const view = await loadCoach(db, user.user_id, todayFor(user));
  return view?.plan?.days.find((d) => d.weekday === isoWeekday(todayFor(user))) ?? null;
}

/** /workout — today's planned session with a Done button. */
export async function workoutCommand(db: SupabaseClient, user: BotUser) {
  const date = todayFor(user);
  const day = await plannedToday(db, user);
  if (await hasSession(db, user.user_id, date)) return void (await sendMessage(user.chat_id, "Today's workout is already logged ✅ Log lifts with <code>/lift bench press 3x8 40</code>."));
  const text = day ? `🏋️ Today: <b>${escapeHtml(day.title)}</b> — ${escapeHtml(day.focus)}.\nDid it?` : "Nothing is planned today. Did you train anyway?";
  await sendMessage(user.chat_id, `${text}\n\nTip: <code>/lift squats 4x10 60</code> logs sets as you go.`, [[{ text: "✅ Mark workout done", callback_data: `w|${date}` }]]);
}

export async function workoutDoneCallback(db: SupabaseClient, user: BotUser, callbackId: string, date: string) {
  if (date !== todayFor(user)) return void (await answerCallback(callbackId, "That prompt is from an earlier day."));
  if (await hasSession(db, user.user_id, date)) return void (await answerCallback(callbackId, "Already logged ✅"));
  const day = await plannedToday(db, user);
  await logSession(db, user.user_id, date, day?.title ?? "Workout");
  await answerCallback(callbackId, "Workout logged ✅");
  await sendMessage(user.chat_id, `Nice work 💪 <b>${escapeHtml(day?.title ?? "Workout")}</b> is in the log.`);
}

/** /lift bench press 3x8 40 */
export async function liftCommand(db: SupabaseClient, user: BotUser, text: string) {
  const lift = parseLift(text);
  if (!lift) return void (await sendMessage(user.chat_id, "Send it like <code>/lift bench press 3x8 40</code> (exercise, sets×reps, optional kg)."));
  const date = todayFor(user);
  const day = await plannedToday(db, user);
  const id = await sessionForDate(db, user.user_id, date, day?.title ?? "Workout");
  await addLifts(db, user.user_id, id, [lift]);
  const load = lift.weight_kg ? ` @ ${lift.weight_kg} kg` : "";
  await sendMessage(user.chat_id, `Logged: <b>${escapeHtml(lift.exercise)}</b> ${lift.sets}×${lift.reps}${load} 💪`);
}
