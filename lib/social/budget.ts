/** Eating-out / drinks planning. Pure maths: no wellness judgement, just "bank some calories earlier so the week still balances". */
export type EventKind = "out" | "drinks";
export interface SocialEvent { id?: string; date: string; kind: EventKind; note?: string | null; allowance_kcal: number; created_on: string }

/** Typical extra a meal out or a few drinks adds on top of a normal day; shown to the user and editable per event. */
export const DEFAULT_ALLOWANCE: Record<EventKind, number> = { out: 600, drinks: 500 };
export const KIND_LABEL: Record<EventKind, string> = { out: "Eating out", drinks: "Drinks" };

const DAY = 86_400_000;
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const BANK_DAYS = 3;
const MAX_CUT_PER_DAY = 0.15; // never trim more than 15% of the base target from any one day…
const MAX_CUT_TOTAL = 0.2; // …or 20% when events overlap

/** Per-day trim for one event: spread over up to 3 days before it, capped so no day is cut hard. */
function bankedDays(base: number, e: SocialEvent): { cutPerDay: number; days: string[] } {
  const days = [3, 2, 1].map((n) => addDays(e.date, -n)).filter((d) => d >= e.created_on); // can't trim days that already happened
  if (!days.length) return { cutPerDay: 0, days: [] };
  return { cutPerDay: Math.min(e.allowance_kcal / BANK_DAYS, base * MAX_CUT_PER_DAY), days };
}

/** What you actually banked is the bonus on the day itself. */
export function bankedFor(base: number, e: SocialEvent): number {
  const { cutPerDay, days } = bankedDays(base, e);
  return Math.round(cutPerDay * days.length);
}

export function adjustedTarget(base: number | null, date: string, events: SocialEvent[]): { target: number | null; delta: number; reasons: string[] } {
  if (base == null) return { target: null, delta: 0, reasons: [] };
  let cut = 0;
  let bonus = 0;
  const reasons: string[] = [];
  for (const e of events) {
    const { cutPerDay, days } = bankedDays(base, e);
    if (days.includes(date)) { cut += cutPerDay; reasons.push(`saving a little for ${KIND_LABEL[e.kind].toLowerCase()} on ${e.date}`); }
    if (e.date === date) { const b = bankedFor(base, e); if (b > 0) { bonus += b; reasons.push(`${KIND_LABEL[e.kind].toLowerCase()} tonight — banked ${b} kcal`); } }
  }
  cut = Math.min(cut, base * MAX_CUT_TOTAL);
  const delta = Math.round(bonus - cut);
  return { target: Math.round(base + delta), delta, reasons };
}

export function monthUsage(events: Pick<SocialEvent, "date" | "kind">[], month: string): Record<EventKind, number> {
  const u: Record<EventKind, number> = { out: 0, drinks: 0 };
  for (const e of events) if (e.date.startsWith(month)) u[e.kind]++;
  return u;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
/** "today", "tomorrow", "sat"/"saturday" (next one), "2026-10-25" -> ISO date, relative to `today`. null if it isn't a date. */
export function parseWhen(word: string | undefined, today: string): string | null {
  if (!word) return today;
  const w = word.toLowerCase();
  if (w === "today") return today;
  if (w === "tomorrow") return addDays(today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(w) && !Number.isNaN(Date.parse(w))) return w;
  const idx = WEEKDAYS.indexOf(w.slice(0, 3));
  if (idx < 0 || w.length < 3) return null;
  const todayIdx = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, ((idx - todayIdx + 7) % 7) || 7);
}
