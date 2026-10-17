export interface SetRow { date: string; exercise: string; sets: number; reps: number; weight_kg: number | null }
export interface SessionRow { date: string }

const DAY = 86_400_000;
/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Mon=0
  return new Date(t - dow * DAY).toISOString().slice(0, 10);
}

/** The last `n` week-start dates ending with this week, oldest first. */
export function lastWeeks(today: string, n: number): string[] {
  const cur = Date.parse(`${weekStart(today)}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(cur - (n - 1 - i) * 7 * DAY).toISOString().slice(0, 10));
}

export function sessionsPerWeek(sessions: SessionRow[], weeks: string[]): { date: string; value: number }[] {
  const c = new Map(weeks.map((w) => [w, 0]));
  for (const s of sessions) { const w = weekStart(s.date); if (c.has(w)) c.set(w, c.get(w)! + 1); }
  return weeks.map((w) => ({ date: w, value: c.get(w)! }));
}

/** Total volume (sets × reps × kg) per week. Bodyweight sets (no weight) don't count toward volume. */
export function volumePerWeek(rows: SetRow[], weeks: string[]): { date: string; value: number }[] {
  const v = new Map(weeks.map((w) => [w, 0]));
  for (const r of rows) {
    const w = weekStart(r.date);
    if (v.has(w) && r.weight_kg) v.set(w, v.get(w)! + r.sets * r.reps * r.weight_kg);
  }
  return weeks.map((w) => ({ date: w, value: Math.round(v.get(w)!) }));
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Exercises ranked by how often they were logged with a weight. */
export function topLifts(rows: SetRow[], n = 3): string[] {
  const c = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    if (!r.weight_kg) continue;
    const k = norm(r.exercise);
    c.set(k, { label: c.get(k)?.label ?? r.exercise.trim(), count: (c.get(k)?.count ?? 0) + 1 });
  }
  return [...c.values()].sort((a, b) => b.count - a.count).slice(0, n).map((x) => x.label);
}

/** Heaviest weight lifted per day for one exercise, oldest first. */
export function liftProgress(rows: SetRow[], exercise: string): { date: string; value: number }[] {
  const best = new Map<string, number>();
  for (const r of rows) if (norm(r.exercise) === norm(exercise) && r.weight_kg) best.set(r.date, Math.max(best.get(r.date) ?? 0, r.weight_kg));
  return [...best.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

/** "bench press 3x8 40", "squats 4 x 10 60kg", "plank 3x45" -> parts. Weight is optional. */
export function parseLift(text: string): { exercise: string; sets: number; reps: number; weight_kg: number | null } | null {
  const m = text.trim().match(/^(.+?)\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})(?:\s+(\d+(?:[.,]\d+)?)\s*(?:kg|kgs)?)?$/i);
  if (!m) return null;
  const weight = m[4] ? Number(m[4].replace(",", ".")) : null;
  return { exercise: m[1].trim().slice(0, 60), sets: Number(m[2]), reps: Number(m[3]), weight_kg: weight };
}
