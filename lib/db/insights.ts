import type { SupabaseClient } from "@supabase/supabase-js";
import type { FoodRow } from "@/lib/analytics/stats";
import { isScheduled } from "@/lib/habits/schedule";
import { localDateString } from "@/lib/time/day";

// Supabase results are untyped here; rows are shaped by the callers below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ok(res: { data: any; error: { message: string } | null }, what: string): any {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Every confirmed meal item whose local date is in `dates`, flattened for analytics. */
export async function foodRows(db: SupabaseClient, userId: string, tz: string, dates: string[]): Promise<FoodRow[]> {
  const set = new Set(dates);
  const first = new Date(`${dates[0]}T00:00:00Z`).getTime() - 86_400_000;
  const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime() + 2 * 86_400_000;
  const logs = ok(await db.from("meal_logs").select("id, logged_at, meal_type").eq("user_id", userId).eq("status", "confirmed").gte("logged_at", new Date(first).toISOString()).lt("logged_at", new Date(last).toISOString()), "logs") as { id: string; logged_at: string; meal_type: string | null }[];
  const mine = new Map(logs.map((l) => [l.id, { date: localDateString(new Date(l.logged_at), tz), mealType: l.meal_type }]).filter(([, v]) => set.has((v as { date: string }).date)) as [string, { date: string; mealType: string | null }][]);
  if (!mine.size) return [];
  const ids = [...mine.keys()];
  const rows: FoodRow[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const items = ok(await db.from("meal_log_items").select("log_id, name, kcal, protein_g, carbs_g, fat_g, match_type").in("log_id", ids.slice(i, i + 150)), "items") as { log_id: string; name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; match_type: string }[];
    for (const it of items) {
      const l = mine.get(it.log_id)!;
      rows.push({ date: l.date, mealType: l.mealType, name: it.name, kcal: Number(it.kcal), protein: Number(it.protein_g), carbs: Number(it.carbs_g), fat: Number(it.fat_g), estimated: it.match_type === "estimated" });
    }
  }
  return rows;
}

/** Completion rate per active habit over the window, counting only the days each habit was scheduled (and existed). */
export async function habitCompletion(db: SupabaseClient, userId: string, tz: string, dates: string[]) {
  const habits = ok(await db.from("habits").select("id, name, emoji, weekdays, created_at").eq("user_id", userId).is("archived_at", null).order("position"), "habits") as { id: string; name: string; emoji: string; weekdays: number[] | null; created_at: string }[];
  if (!habits.length) return [];
  const logs = ok(await db.from("habit_logs").select("habit_id, date").eq("user_id", userId).gte("date", dates[0]).lte("date", dates[dates.length - 1]), "habit logs") as { habit_id: string; date: string }[];
  return habits.map((h) => {
    const since = localDateString(new Date(h.created_at), tz);
    const scheduled = dates.filter((d) => d >= since && isScheduled(h.weekdays, d));
    const done = new Set(logs.filter((l) => l.habit_id === h.id).map((l) => l.date));
    const doneCount = scheduled.filter((d) => done.has(d)).length;
    return { name: h.name, scheduled: scheduled.length, done: doneCount, pct: scheduled.length ? Math.round((doneCount * 100) / scheduled.length) : null };
  });
}

export async function moodSeries(db: SupabaseClient, userId: string, dates: string[]): Promise<{ date: string; mood: number }[]> {
  const rows = ok(await db.from("journal_entries").select("date, mood").eq("user_id", userId).not("mood", "is", null).gte("date", dates[0]).lte("date", dates[dates.length - 1]).order("date"), "mood") as { date: string; mood: number }[];
  return rows;
}
