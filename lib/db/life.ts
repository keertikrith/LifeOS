import type { SupabaseClient } from "@supabase/supabase-js";
import { averageBalance, dailyBalance, lastNDates, type DayInput } from "@/lib/health/balance";
import { habitStreak, isScheduled } from "@/lib/habits/schedule";
import { extractTags } from "@/lib/journal/mood";
import { localDateString } from "@/lib/time/day";
import type { LogItem, MealLog } from "./meals";

// Supabase results are untyped here; callers cast to the row interfaces below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ok(res: { data: any; error: { message: string } | null }, what: string): any {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export interface HealthRow {
  date: string;
  active_kcal: number | null;
  resting_kcal: number | null;
  steps: number | null;
  sleep_minutes: number | null;
  weight_kg: number | null;
  workouts: { type: string; minutes?: number; kcal?: number }[] | null;
}

export interface Habit { id: string; name: string; emoji: string; weekdays: number[] | null; position: number }
export interface JournalEntry { id: string; date: string; mood: number | null; notes: string; tags: string[] }

// ───────────── health + balance ─────────────
export async function healthRange(db: SupabaseClient, userId: string, from: string, to: string): Promise<HealthRow[]> {
  const rows = ok(await db.from("health_daily").select("date, active_kcal, resting_kcal, steps, sleep_minutes, weight_kg, workouts").eq("user_id", userId).gte("date", from).lte("date", to).order("date"), "healthRange");
  const num = (v: unknown) => (v == null ? null : Number(v));
  return rows.map((r: HealthRow) => ({ ...r, active_kcal: num(r.active_kcal), resting_kcal: num(r.resting_kcal), weight_kg: num(r.weight_kg) }));
}

/** Confirmed kcal per local day for a window of dates. */
export async function eatenByDay(db: SupabaseClient, userId: string, tz: string, dates: string[]): Promise<Map<string, { eaten: number; hasFood: boolean }>> {
  const first = new Date(`${dates[0]}T00:00:00Z`).getTime() - 86_400_000;
  const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime() + 2 * 86_400_000;
  const logs = ok(await db.from("meal_logs").select("logged_at, total_kcal").eq("user_id", userId).eq("status", "confirmed").gte("logged_at", new Date(first).toISOString()).lt("logged_at", new Date(last).toISOString()), "eatenByDay");
  const map = new Map<string, { eaten: number; hasFood: boolean }>(dates.map((d) => [d, { eaten: 0, hasFood: false }]));
  for (const l of logs as { logged_at: string; total_kcal: number }[]) {
    const e = map.get(localDateString(new Date(l.logged_at), tz));
    if (e) { e.eaten += Number(l.total_kcal); e.hasFood = true; }
  }
  return map;
}

export interface TrendDay extends DayInput {
  steps: number | null;
  sleepMinutes: number | null;
  weightKg: number | null;
  balance: number | null;
}

export async function trend(db: SupabaseClient, userId: string, tz: string, endDate: string, n: number): Promise<TrendDay[]> {
  const dates = lastNDates(endDate, n);
  const [eaten, health] = await Promise.all([eatenByDay(db, userId, tz, dates), healthRange(db, userId, dates[0], dates[dates.length - 1])]);
  const hmap = new Map(health.map((h) => [h.date, h]));
  return dates.map((date) => {
    const e = eaten.get(date)!;
    const h = hmap.get(date);
    const base = { date, eaten: Math.round(e.eaten), hasFood: e.hasFood, activeKcal: h?.active_kcal ?? null, restingKcal: h?.resting_kcal ?? null };
    const b = dailyBalance(base);
    return { ...base, steps: h?.steps ?? null, sleepMinutes: h?.sleep_minutes ?? null, weightKg: h?.weight_kg ?? null, balance: b.kind === "balance" && e.hasFood ? b.balance : null };
  });
}

export { averageBalance };

// ───────────── meals for a local date ─────────────
export async function mealsForDate(db: SupabaseClient, userId: string, tz: string, date: string): Promise<MealLog[]> {
  const from = new Date(`${date}T00:00:00Z`).getTime() - 86_400_000;
  const logs = ok(await db.from("meal_logs").select("*").eq("user_id", userId).eq("status", "confirmed").gte("logged_at", new Date(from).toISOString()).lt("logged_at", new Date(from + 3 * 86_400_000).toISOString()).order("logged_at"), "mealsForDate") as Omit<MealLog, "items">[];
  const mine = logs.filter((l) => localDateString(new Date(l.logged_at), tz) === date);
  if (!mine.length) return [];
  const items = ok(await db.from("meal_log_items").select("*").in("log_id", mine.map((l) => l.id)).order("position"), "mealItems") as LogItem[];
  return mine.map((l) => ({ ...l, items: items.filter((i) => i.log_id === l.id) }));
}

// ───────────── habits ─────────────
export async function listHabits(db: SupabaseClient, userId: string): Promise<Habit[]> {
  return ok(await db.from("habits").select("id, name, emoji, weekdays, position").eq("user_id", userId).is("archived_at", null).order("position").order("created_at"), "listHabits");
}

export async function createHabit(db: SupabaseClient, userId: string, h: { name: string; emoji?: string; weekdays?: number[] | null }) {
  const existing = await listHabits(db, userId);
  if (existing.length >= 30) throw new Error("Up to 30 active habits");
  const weekdays = h.weekdays && h.weekdays.length > 0 && h.weekdays.length < 7 ? [...new Set(h.weekdays)].sort() : null;
  ok(await db.from("habits").insert({ user_id: userId, name: h.name.trim().slice(0, 80), emoji: (h.emoji || "✅").slice(0, 8), weekdays, position: existing.length }), "createHabit");
}

export async function archiveHabit(db: SupabaseClient, userId: string, habitId: string) {
  ok(await db.from("habits").update({ archived_at: new Date().toISOString() }).eq("id", habitId).eq("user_id", userId), "archiveHabit");
}

/** Sets done/undone for a habit on a local date. Returns the new state. */
export async function setHabitDone(db: SupabaseClient, userId: string, habitId: string, date: string, done?: boolean): Promise<boolean> {
  const habit = ok(await db.from("habits").select("id").eq("id", habitId).eq("user_id", userId).maybeSingle(), "habitOwner");
  if (!habit) throw new Error("Habit not found");
  const existing = ok(await db.from("habit_logs").select("habit_id").eq("habit_id", habitId).eq("date", date).maybeSingle(), "habitLog");
  const target = done ?? !existing;
  if (target && !existing) ok(await db.from("habit_logs").insert({ habit_id: habitId, user_id: userId, date }), "markHabit");
  if (!target && existing) ok(await db.from("habit_logs").delete().eq("habit_id", habitId).eq("date", date).eq("user_id", userId), "unmarkHabit");
  return target;
}

export interface HabitStatus extends Habit { done: boolean; scheduled: boolean; streak: number }

export async function habitStatuses(db: SupabaseClient, userId: string, date: string): Promise<HabitStatus[]> {
  const habits = await listHabits(db, userId);
  if (!habits.length) return [];
  const since = new Date(new Date(`${date}T00:00:00Z`).getTime() - 400 * 86_400_000).toISOString().slice(0, 10);
  const logs = ok(await db.from("habit_logs").select("habit_id, date").eq("user_id", userId).gte("date", since).lte("date", date), "habitLogs") as { habit_id: string; date: string }[];
  return habits.map((h) => {
    const done = new Set(logs.filter((l) => l.habit_id === h.id).map((l) => l.date));
    return { ...h, done: done.has(date), scheduled: isScheduled(h.weekdays, date), streak: habitStreak(h.weekdays, done, date) };
  });
}

// ───────────── journal ─────────────
export async function getJournal(db: SupabaseClient, userId: string, date: string): Promise<JournalEntry | null> {
  return ok(await db.from("journal_entries").select("id, date, mood, notes, tags").eq("user_id", userId).eq("date", date).maybeSingle(), "getJournal");
}

/** Upserts the day's entry. Only provided fields change, so setting mood never wipes notes (and vice-versa). */
export async function saveJournal(db: SupabaseClient, userId: string, date: string, patch: { mood?: number | null; notes?: string }) {
  const current = await getJournal(db, userId, date);
  const notes = patch.notes !== undefined ? patch.notes.trim().slice(0, 5000) : current?.notes ?? "";
  const row = {
    user_id: userId, date,
    mood: patch.mood !== undefined ? patch.mood : current?.mood ?? null,
    notes,
    tags: extractTags(notes),
    updated_at: new Date().toISOString(),
  };
  ok(await db.from("journal_entries").upsert(row, { onConflict: "user_id,date" }), "saveJournal");
}

export async function recentJournal(db: SupabaseClient, userId: string, limit = 14): Promise<JournalEntry[]> {
  return ok(await db.from("journal_entries").select("id, date, mood, notes, tags").eq("user_id", userId).order("date", { ascending: false }).limit(limit), "recentJournal");
}
