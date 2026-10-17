/** Day boundaries are always computed in the user's timezone, never UTC. */

function partsInTz(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const { type, value } of f.formatToParts(date)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `timeZone` from UTC at `date`, in ms (IST = +19_800_000). */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsInTz(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * A "zone" is an IANA timezone, optionally suffixed with the hour the user's day starts: "Asia/Kolkata|4".
 * With a 4 AM start, 1:30 AM on the 18th still belongs to the 17th. Build one with `zoneWithDayStart`;
 * a plain timezone means the day starts at midnight.
 */
export const zoneWithDayStart = (timeZone: string, startHour: number | null | undefined) => (startHour ? `${timeZone}|${startHour}` : timeZone);

function splitZone(zone: string): { tz: string; startHour: number } {
  const [tz, h] = zone.split("|");
  return { tz, startHour: Number(h) || 0 };
}

const HOUR = 3_600_000;

/** Local calendar date `YYYY-MM-DD` of `date`, in the user's day (see `zoneWithDayStart`). */
export function localDateString(date: Date, zone: string): string {
  const { tz: timeZone, startHour } = splitZone(zone);
  const p = partsInTz(new Date(date.getTime() - startHour * HOUR), timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** UTC instants bounding the user's day that contains `date`: [start, end). */
export function dayBounds(date: Date, zone: string): { start: Date; end: Date } {
  const { tz: timeZone, startHour } = splitZone(zone);
  const p = partsInTz(new Date(date.getTime() - startHour * HOUR), timeZone);
  const startFor = (y: number, m: number, d: number) => {
    const guess = new Date(Date.UTC(y, m - 1, d));
    return new Date(guess.getTime() - offsetMs(guess, timeZone));
  };
  const start = new Date(startFor(p.year, p.month, p.day).getTime() + startHour * HOUR);
  const end = new Date(startFor(p.year, p.month, p.day + 1).getTime() + startHour * HOUR);
  return { start, end };
}

/** Wall-clock hour (0–23) — the real hour, not shifted by the day start. */
export function localHour(date: Date, zone: string): number {
  return partsInTz(date, splitZone(zone).tz).hour;
}

/** Meal slot from local hour. Used only when the user's text doesn't say. */
export function mealTypeForHour(hour: number): "breakfast" | "lunch" | "snack" | "dinner" {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 19) return "snack";
  return "dinner";
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
