import type { SupabaseClient } from "@supabase/supabase-js";
import type { SetRow } from "@/lib/workouts/stats";

const check = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? []) as T;
};

export interface LiftInput { exercise: string; sets: number; reps: number; weight_kg: number | null }
export interface SessionSummary { id: string; date: string; title: string; minutes: number | null; note: string | null; sets: LiftInput[] }

/** Today's session if one exists (so /lift adds to it), otherwise a new one. */
export async function sessionForDate(db: SupabaseClient, userId: string, date: string, title: string): Promise<string> {
  const rows = check(await db.from("workout_sessions").select("id").eq("user_id", userId).eq("date", date).order("created_at").limit(1), "sessionForDate") as { id: string }[];
  if (rows.length) return rows[0].id;
  const created = check(await db.from("workout_sessions").insert({ user_id: userId, date, title }).select("id").single(), "createSession") as unknown as { id: string };
  return created.id;
}

export async function addLifts(db: SupabaseClient, userId: string, sessionId: string, lifts: LiftInput[]) {
  if (!lifts.length) return;
  const { count } = await db.from("workout_sets").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  const { error } = await db.from("workout_sets").insert(lifts.map((l, i) => ({ ...l, user_id: userId, session_id: sessionId, position: (count ?? 0) + i })));
  if (error) throw new Error(`addLifts: ${error.message}`);
}

export async function logSession(db: SupabaseClient, userId: string, date: string, title: string, o: { minutes?: number | null; note?: string | null; lifts?: LiftInput[] } = {}) {
  const id = await sessionForDate(db, userId, date, title);
  if (o.minutes || o.note) await db.from("workout_sessions").update({ ...(o.minutes ? { minutes: o.minutes } : {}), ...(o.note ? { note: o.note } : {}) }).eq("id", id).eq("user_id", userId);
  await addLifts(db, userId, id, o.lifts ?? []);
  return id;
}

export async function sessionsSince(db: SupabaseClient, userId: string, from: string): Promise<SessionSummary[]> {
  const rows = check(await db.from("workout_sessions").select("id, date, title, minutes, note, workout_sets(exercise, sets, reps, weight_kg, position)").eq("user_id", userId).gte("date", from).order("date", { ascending: false }), "sessionsSince") as unknown as (Omit<SessionSummary, "sets"> & { workout_sets: (LiftInput & { position: number })[] })[];
  return rows.map(({ workout_sets, ...s }) => ({ ...s, sets: [...workout_sets].sort((a, b) => a.position - b.position).map((l) => ({ ...l, weight_kg: l.weight_kg == null ? null : Number(l.weight_kg) })) }));
}

export const setRows = (sessions: SessionSummary[]): SetRow[] => sessions.flatMap((s) => s.sets.map((l) => ({ date: s.date, ...l })));

export async function hasSession(db: SupabaseClient, userId: string, date: string): Promise<boolean> {
  const { count } = await db.from("workout_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("date", date);
  return (count ?? 0) > 0;
}
