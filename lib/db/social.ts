import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, adjustedTarget, DEFAULT_ALLOWANCE, type EventKind, type SocialEvent } from "@/lib/social/budget";

const check = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? []) as T;
};

export async function listEvents(db: SupabaseClient, userId: string, from: string, to: string): Promise<SocialEvent[]> {
  return check(await db.from("social_events").select("id, date, kind, note, allowance_kcal, created_on").eq("user_id", userId).gte("date", from).lte("date", to).order("date"), "listEvents") as SocialEvent[];
}

export async function addEvent(db: SupabaseClient, userId: string, e: { date: string; kind: EventKind; today: string; note?: string; allowance?: number }) {
  const { error } = await db.from("social_events").insert({ user_id: userId, date: e.date, kind: e.kind, note: e.note ?? null, allowance_kcal: e.allowance ?? DEFAULT_ALLOWANCE[e.kind], created_on: e.today });
  if (error) throw new Error(`addEvent: ${error.message}`);
}

/** The day's target after any banking for an upcoming eating-out / drinks event. Only events within 3 days matter. */
export async function targetForDay(db: SupabaseClient, userId: string, date: string, base: number | null) {
  if (base == null) return { target: null, delta: 0, reasons: [] as string[] };
  return adjustedTarget(base, date, await listEvents(db, userId, date, addDays(date, 3)));
}
