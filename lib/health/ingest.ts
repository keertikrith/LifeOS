import { z } from "zod";

/** iOS Shortcuts often sends numbers as strings, or empty strings for "no data". Treat blanks as absent, never as 0. */
const metric = (min: number, max: number, int = false) =>
  z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return undefined;
      if (typeof v === "string") {
        const n = Number(v.replace(/,/g, "").trim());
        return Number.isNaN(n) ? v : n;
      }
      return v;
    },
    (int ? z.number().int() : z.number()).min(min).max(max).optional(),
  );

const workout = z.object({
  type: z.string().min(1).max(40),
  minutes: metric(0, 1440),
  kcal: metric(0, 10000),
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(s)), "invalid date");

export const dayPayloadSchema = z.object({
  date: dateString,
  active_kcal: metric(0, 20000),
  resting_kcal: metric(0, 20000),
  steps: metric(0, 200000).transform((n) => (n === undefined ? n : Math.round(n))),
  sleep_minutes: metric(0, 1440).transform((n) => (n === undefined ? n : Math.round(n))),
  weight_kg: metric(20, 400),
  workouts: z.array(workout).max(20).optional(),
});
export type DayPayload = z.infer<typeof dayPayloadSchema>;

export const METRIC_KEYS = ["active_kcal", "resting_kcal", "steps", "sleep_minutes", "weight_kg", "workouts"] as const;

/** Accepts one day object, or {days: [...]} for backfills. Rejects empty days and future dates. */
export function parseIngestBody(body: unknown, now = new Date()): { ok: true; days: DayPayload[] } | { ok: false; error: string } {
  const raw = body && typeof body === "object" && Array.isArray((body as { days?: unknown }).days) ? (body as { days: unknown[] }).days : [body];
  if (raw.length === 0 || raw.length > 31) return { ok: false, error: "send between 1 and 31 days per request" };

  const days: DayPayload[] = [];
  for (const [i, item] of raw.entries()) {
    const parsed = dayPayloadSchema.safeParse(item);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: `day ${i + 1}: ${issue.path.join(".") || "body"} — ${issue.message}` };
    }
    const d = parsed.data;
    const tooFar = Date.parse(d.date) > now.getTime() + 36 * 3600_000; // allow timezones ahead of UTC
    if (tooFar) return { ok: false, error: `day ${i + 1}: date ${d.date} is in the future` };
    if (Date.parse(d.date) < now.getTime() - 800 * 86_400_000) return { ok: false, error: `day ${i + 1}: date ${d.date} is too old` };
    if (!METRIC_KEYS.some((k) => d[k] !== undefined)) return { ok: false, error: `day ${i + 1}: no metrics provided` };
    days.push(d);
  }
  // later duplicates of the same date within one request win
  const byDate = new Map(days.map((d) => [d.date, d]));
  return { ok: true, days: [...byDate.values()] };
}
