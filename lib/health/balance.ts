/**
 * Daily balance = eaten − (resting + active). Missing burn data is reported as such — never treated as zero.
 * Language stays neutral: "surplus" / "deficit".
 */
export interface DayInput {
  date: string;
  eaten: number;
  hasFood: boolean;
  activeKcal: number | null;
  restingKcal: number | null;
}

export type Balance =
  | { kind: "no_burn_data"; eaten: number }
  | { kind: "balance"; eaten: number; burned: number; balance: number; label: "surplus" | "deficit" | "even" };

export function dailyBalance(d: Pick<DayInput, "eaten" | "activeKcal" | "restingKcal">): Balance {
  if (d.activeKcal == null || d.restingKcal == null) return { kind: "no_burn_data", eaten: d.eaten };
  const burned = d.activeKcal + d.restingKcal;
  const balance = Math.round(d.eaten - burned);
  return { kind: "balance", eaten: d.eaten, burned: Math.round(burned), balance, label: Math.abs(balance) < 1 ? "even" : balance > 0 ? "surplus" : "deficit" };
}

export interface WeeklyAverage {
  average: number | null;
  daysCounted: number;
  daysInWindow: number;
}

/**
 * Average balance over days that have BOTH burn data and at least one logged meal.
 * A day with burn data but no food logged isn't a zero-calorie day — it's a day we didn't track — so it's skipped.
 */
export function averageBalance(days: DayInput[]): WeeklyAverage {
  const counted = days.filter((d) => d.hasFood && d.activeKcal != null && d.restingKcal != null);
  if (!counted.length) return { average: null, daysCounted: 0, daysInWindow: days.length };
  const sum = counted.reduce((s, d) => s + (d.eaten - (d.activeKcal! + d.restingKcal!)), 0);
  return { average: Math.round(sum / counted.length), daysCounted: counted.length, daysInWindow: days.length };
}

export const describeBalance = (n: number) => (Math.abs(n) < 1 ? "even" : n > 0 ? `${Math.round(n).toLocaleString("en-IN")} kcal surplus` : `${Math.round(-n).toLocaleString("en-IN")} kcal deficit`);

/** The last `n` local calendar dates ending at `endDate` (inclusive), oldest first. */
export function lastNDates(endDate: string, n: number): string[] {
  const [y, m, d] = endDate.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d - (n - 1 - i))).toISOString().slice(0, 10));
}
