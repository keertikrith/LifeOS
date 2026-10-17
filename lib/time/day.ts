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

/** Local calendar date `YYYY-MM-DD` of `date` in `timeZone`. */
export function localDateString(date: Date, timeZone: string): string {
  const p = partsInTz(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** UTC instants bounding the local day that contains `date`: [start, end). */
export function dayBounds(date: Date, timeZone: string): { start: Date; end: Date } {
  const p = partsInTz(date, timeZone);
  const startFor = (y: number, m: number, d: number) => {
    const guess = new Date(Date.UTC(y, m - 1, d));
    return new Date(guess.getTime() - offsetMs(guess, timeZone));
  };
  const start = startFor(p.year, p.month, p.day);
  const end = startFor(p.year, p.month, p.day + 1);
  return { start, end };
}

export function localHour(date: Date, timeZone: string): number {
  return partsInTz(date, timeZone).hour;
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
