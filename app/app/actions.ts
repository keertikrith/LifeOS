"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminClient, userClient } from "@/lib/db/clients";
import { archiveHabit, createHabit, saveJournal, setHabitDone } from "@/lib/db/life";
import { createLinkCode } from "@/lib/db/meals";
import { ACTIVITY, computeCoachPlan, type Activity, type Sex } from "@/lib/coach/calc";
import { saveHealthManual } from "@/lib/health/manual";
import { createApiToken } from "@/lib/health/tokens";
import { addEvent } from "@/lib/db/social";
import { logSession, type LiftInput } from "@/lib/db/workouts";
import { DEFAULT_ALLOWANCE, type EventKind } from "@/lib/social/budget";
import { parseLift } from "@/lib/workouts/stats";
import { env } from "@/lib/env";
import { isValidTimeZone, localDateString, zoneWithDayStart } from "@/lib/time/day";

async function requireUser() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/login");
  return { db, user: data.user };
}

export type LinkState = { code?: string; deepLink?: string; error?: string };

export async function generateLinkCode(): Promise<LinkState> {
  const { user } = await requireUser();
  try {
    const code = await createLinkCode(adminClient(), user.id);
    const bot = env.telegramBotUsername();
    return { code, deepLink: bot && !bot.startsWith("PASTE") ? `https://t.me/${bot}?start=${code}` : undefined };
  } catch {
    return { error: "Couldn't create a code. Please try again." };
  }
}

export async function unlinkTelegram() {
  const { db, user } = await requireUser();
  await db.from("telegram_links").delete().eq("user_id", user.id);
  revalidatePath("/app");
}

export async function saveSettings(formData: FormData) {
  const { db, user } = await requireUser();
  const timezone = String(formData.get("timezone") ?? "Asia/Kolkata");
  const targetRaw = String(formData.get("calorie_target") ?? "").trim();
  const target = targetRaw === "" ? null : Number(targetRaw);
  const dayStart = Number(formData.get("day_start_hour") ?? 0);
  if (!isValidTimeZone(timezone) || !Number.isInteger(dayStart) || dayStart < 0 || dayStart > 6) return;
  if (target !== null && (!Number.isInteger(target) || target < 500 || target > 10000)) return;
  const hour = (k: string, fallback: number) => { const n = Number(formData.get(k)); return Number.isInteger(n) ? n : fallback; };
  const wake = hour("wake_hour", 7), sleep = hour("sleep_hour", 22);
  const outB = hour("monthly_out_budget", 4), drinkB = hour("monthly_drink_budget", 2);
  if (wake < 0 || wake > 23 || sleep < 1 || sleep > 24 || sleep <= wake || outB < 0 || outB > 31 || drinkB < 0 || drinkB > 31) return;
  await db.from("profiles").update({ timezone, calorie_target: target, day_start_hour: dayStart, nudges_enabled: formData.get("nudges_enabled") === "on", wake_hour: wake, sleep_hour: sleep, monthly_out_budget: outB, monthly_drink_budget: drinkB }).eq("id", user.id);
  revalidatePath("/app");
}

export async function signOut() {
  const db = await userClient();
  await db.auth.signOut();
  redirect("/");
}

// ───────────── habits ─────────────
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

async function profileTz(db: Awaited<ReturnType<typeof userClient>>, userId: string) {
  const { data } = await db.from("profiles").select("timezone, day_start_hour").eq("id", userId).single();
  return zoneWithDayStart((data?.timezone as string) ?? "Asia/Kolkata", data?.day_start_hour as number | undefined);
}

export async function toggleHabit(habitId: string, date: string) {
  const { db, user } = await requireUser();
  if (!validDate(date)) return;
  // no future ticks: a habit can't be done tomorrow
  if (date > localDateString(new Date(), await profileTz(db, user.id))) return;
  await setHabitDone(db, user.id, habitId, date);
  revalidatePath("/app", "layout");
}

export async function addHabit(formData: FormData) {
  const { db, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const weekdays = formData.getAll("weekday").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  await createHabit(db, user.id, { name, emoji: String(formData.get("emoji") ?? "").trim() || "✅", weekdays });
  revalidatePath("/app", "layout");
}

export async function archiveHabitAction(habitId: string) {
  const { db, user } = await requireUser();
  await archiveHabit(db, user.id, habitId);
  revalidatePath("/app", "layout");
}

// ───────────── journal ─────────────
export async function saveJournalAction(formData: FormData) {
  const { db, user } = await requireUser();
  const date = String(formData.get("date") ?? "");
  if (!validDate(date) || date > localDateString(new Date(), await profileTz(db, user.id))) return;
  const patch: { mood?: number; notes?: string } = {};
  const moodRaw = formData.get("mood");
  if (moodRaw) {
    const mood = Number(moodRaw);
    if (Number.isInteger(mood) && mood >= 1 && mood <= 5) patch.mood = mood;
  }
  if (formData.has("notes")) patch.notes = String(formData.get("notes") ?? "");
  await saveJournal(db, user.id, date, patch);
  revalidatePath("/app", "layout");
}

// ───────────── Apple Health ingest tokens ─────────────
export async function createToken(name: string): Promise<{ token?: string; error?: string }> {
  const { user } = await requireUser();
  const res = await createApiToken(adminClient(), user.id, name);
  revalidatePath("/app/health");
  return res;
}

export async function revokeToken(tokenId: string) {
  const { db, user } = await requireUser();
  await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId).eq("user_id", user.id);
  revalidatePath("/app/health");
}

// ───────────── manual health entry (no Shortcut needed) ─────────────
export async function logHealthManual(_prev: { ok?: boolean; error?: string }, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { db, user } = await requireUser();
  const today = localDateString(new Date(), await profileTz(db, user.id));
  const date = String(formData.get("date") || today);
  if (!validDate(date) || date > today) return { error: "Pick today or an earlier date." };
  const num = (k: string) => String(formData.get(k) ?? "").trim();
  const sleepH = num("sleep_hours");
  const metrics = {
    active_kcal: num("active_kcal"),
    resting_kcal: num("resting_kcal"),
    steps: num("steps"),
    weight_kg: num("weight_kg"),
    sleep_minutes: sleepH === "" ? "" : String(Math.round(Number(sleepH) * 60)),
  };
  if (Object.values(metrics).every((v) => v === "")) return { error: "Enter at least one number." };
  const res = await saveHealthManual(adminClient(), user.id, date, metrics, "manual");
  if (!res.ok) return { error: res.error };
  revalidatePath("/app", "layout");
  return { ok: true };
}

// ───────────── coach ─────────────
export async function saveCoach(_prev: { ok?: boolean; error?: string }, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { db, user } = await requireUser();
  const tz = await profileTz(db, user.id);
  const today = localDateString(new Date(), tz);
  const n = (k: string) => Number(String(formData.get(k) ?? "").trim());
  const sex = String(formData.get("sex")) as Sex;
  const activity = String(formData.get("activity")) as Activity;
  const equipment = String(formData.get("equipment"));
  const experience = String(formData.get("experience"));
  const age = n("age"), height = n("height_cm"), weight = n("weight_kg"), goal = n("goal_weight_kg"), days = n("days_per_week");
  const goalDateRaw = String(formData.get("goal_date") ?? "").trim();
  if (!["female", "male", "other"].includes(sex) || !(activity in ACTIVITY) || !["home", "gym"].includes(equipment) || !["beginner", "intermediate"].includes(experience))
    return { error: "Please fill in every choice." };
  if (goalDateRaw && (!validDate(goalDateRaw) || goalDateRaw <= today)) return { error: "Pick a goal date in the future, or leave it blank." };

  // validate with the same maths the page uses, so we never store inputs we'd refuse to plan for
  const check = computeCoachPlan({ sex, age, heightCm: height, weightKg: weight, goalWeightKg: goal, activity, goalDate: goalDateRaw || null, today });
  if (!check.ok) return { error: check.reason };

  const { error } = await db.from("coach_profiles").upsert({
    user_id: user.id, sex, birth_year: Number(today.slice(0, 4)) - age, height_cm: height, activity, start_weight_kg: weight, goal_weight_kg: goal,
    goal_date: goalDateRaw || null, days_per_week: Math.min(6, Math.max(2, Math.round(days) || 3)), equipment, experience, started_on: today, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return { error: "Couldn't save. Please check the numbers and try again." };

  // the plan's calories become your daily target (shown on Today and in Telegram)
  await db.from("profiles").update({ calorie_target: check.targetKcal }).eq("id", user.id);
  revalidatePath("/app", "layout");
  return { ok: true };
}

// ───────────── edit past meals (web) ─────────────
export async function deleteMeal(logId: string) {
  const { db, user } = await requireUser();
  await db.from("meal_logs").delete().eq("id", logId).eq("user_id", user.id);
  revalidatePath("/app", "layout");
}

/** Changes an item's quantity and scales its calories/macros in proportion, then refreshes the meal total. */
export async function setItemQuantity(itemId: string, quantity: number) {
  const { db, user } = await requireUser();
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) return;
  const { data: item } = await db.from("meal_log_items").select("id, log_id, quantity, kcal, protein_g, carbs_g, fat_g").eq("id", itemId).eq("user_id", user.id).single();
  if (!item) return;
  const f = quantity / Number(item.quantity);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  await db.from("meal_log_items").update({ quantity, kcal: Math.round(Number(item.kcal) * f), protein_g: r1(Number(item.protein_g) * f), carbs_g: r1(Number(item.carbs_g) * f), fat_g: r1(Number(item.fat_g) * f) }).eq("id", itemId).eq("user_id", user.id);
  await refreshTotal(db, item.log_id as string);
  revalidatePath("/app", "layout");
}

export async function removeItem(itemId: string) {
  const { db, user } = await requireUser();
  const { data: item } = await db.from("meal_log_items").select("log_id").eq("id", itemId).eq("user_id", user.id).single();
  if (!item) return;
  await db.from("meal_log_items").delete().eq("id", itemId).eq("user_id", user.id);
  const { count } = await db.from("meal_log_items").select("id", { count: "exact", head: true }).eq("log_id", item.log_id as string);
  if (!count) await db.from("meal_logs").delete().eq("id", item.log_id as string).eq("user_id", user.id);
  else await refreshTotal(db, item.log_id as string);
  revalidatePath("/app", "layout");
}

async function refreshTotal(db: Awaited<ReturnType<typeof userClient>>, logId: string) {
  const { data } = await db.from("meal_log_items").select("kcal").eq("log_id", logId);
  const total = Math.round((data ?? []).reduce((s, i) => s + Number(i.kcal), 0));
  await db.from("meal_logs").update({ total_kcal: total }).eq("id", logId);
}

// ───────────── reset ─────────────
/** Deletes everything the user has logged. Keeps the account, Telegram link, habits, food defaults, API tokens and coach profile. */
export async function resetLogs(_prev: { ok?: boolean; error?: string }, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { db, user } = await requireUser();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "RESET") return { error: "Type RESET to confirm." };
  for (const table of ["meal_logs", "health_daily", "habit_logs", "journal_entries"]) {
    const { error } = await db.from(table).delete().eq("user_id", user.id);
    if (error) return { error: `Couldn't clear ${table}. Nothing else was touched after that point — try again.` };
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}

// ───────────── workouts & social events ─────────────
type Result = { ok?: boolean; error?: string };

export async function logWorkout(_prev: Result, formData: FormData): Promise<Result> {
  const { db, user } = await requireUser();
  const today = localDateString(new Date(), await profileTz(db, user.id));
  const date = String(formData.get("date") || today);
  if (!validDate(date) || date > today) return { error: "Pick today or an earlier date." };
  const title = String(formData.get("title") ?? "").trim().slice(0, 60) || "Workout";
  const minutes = Number(String(formData.get("minutes") ?? "").trim()) || null;
  if (minutes !== null && (minutes < 1 || minutes > 600)) return { error: "Minutes should be between 1 and 600." };
  const lifts: LiftInput[] = [];
  for (const line of String(formData.get("lifts") ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) {
    const l = parseLift(line);
    if (!l) return { error: `Couldn't read “${line.slice(0, 40)}”. Use: exercise 3x8 40 (weight optional).` };
    lifts.push(l);
  }
  await logSession(db, user.id, date, title, { minutes, note: String(formData.get("note") ?? "").trim().slice(0, 300) || null, lifts });
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function deleteWorkout(sessionId: string) {
  const { db, user } = await requireUser();
  await db.from("workout_sessions").delete().eq("id", sessionId).eq("user_id", user.id);
  revalidatePath("/app", "layout");
}

export async function addSocialEvent(_prev: Result, formData: FormData): Promise<Result> {
  const { db, user } = await requireUser();
  const today = localDateString(new Date(), await profileTz(db, user.id));
  const date = String(formData.get("date") ?? "");
  const kind = String(formData.get("kind")) as EventKind;
  if (!validDate(date) || date < today) return { error: "Pick today or a future date." };
  if (kind !== "out" && kind !== "drinks") return { error: "Pick eating out or drinks." };
  const allowance = Number(String(formData.get("allowance") ?? "").trim() || DEFAULT_ALLOWANCE[kind]);
  if (!Number.isFinite(allowance) || allowance < 0 || allowance > 3000) return { error: "Extra calories should be between 0 and 3000." };
  await addEvent(db, user.id, { date, kind, today, allowance: Math.round(allowance), note: String(formData.get("note") ?? "").trim().slice(0, 100) || undefined });
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function deleteSocialEvent(id: string) {
  const { db, user } = await requireUser();
  await db.from("social_events").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/app", "layout");
}
