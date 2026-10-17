import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateString } from "@/lib/time/day";

/** Consecutive local days (ending today, or yesterday if today is still empty) with at least one confirmed log. */
export async function loggingStreak(db: SupabaseClient, userId: string, tz: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 400 * 86_400_000).toISOString();
  const { data, error } = await db.from("meal_logs").select("logged_at").eq("user_id", userId).eq("status", "confirmed").gte("logged_at", since);
  if (error) throw new Error(error.message);
  const days = new Set((data ?? []).map((r: { logged_at: string }) => localDateString(new Date(r.logged_at), tz)));
  let streak = 0;
  let cursor = new Date(now);
  if (!days.has(localDateString(cursor, tz))) cursor = new Date(cursor.getTime() - 86_400_000);
  while (days.has(localDateString(cursor, tz))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}
