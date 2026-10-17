/** Pure analytics over confirmed meal items and daily health rows. All dates are the user's local YYYY-MM-DD. */
import { isoWeekday } from "@/lib/habits/schedule";

export interface FoodRow { date: string; mealType: string | null; name: string; kcal: number; protein: number; carbs: number; fat: number; estimated: boolean }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function dailyTotals(rows: FoodRow[]): Map<string, { kcal: number; protein: number; carbs: number; fat: number }> {
  const m = new Map<string, { kcal: number; protein: number; carbs: number; fat: number }>();
  for (const r of rows) {
    const d = m.get(r.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    d.kcal += r.kcal; d.protein += r.protein; d.carbs += r.carbs; d.fat += r.fat;
    m.set(r.date, d);
  }
  return m;
}

/** Share of calories from protein/carbs/fat (4/4/9 kcal per gram). Percentages sum to 100. Null if nothing logged. */
export function macroShare(rows: FoodRow[]): { proteinPct: number; carbsPct: number; fatPct: number; avgProtein: number; avgCarbs: number; avgFat: number; days: number } | null {
  const days = dailyTotals(rows);
  if (!days.size) return null;
  const p = sum(rows.map((r) => r.protein)), c = sum(rows.map((r) => r.carbs)), f = sum(rows.map((r) => r.fat));
  const total = p * 4 + c * 4 + f * 9;
  if (total <= 0) return null;
  const proteinPct = Math.round((p * 4 * 100) / total), fatPct = Math.round((f * 9 * 100) / total);
  return { proteinPct, fatPct, carbsPct: 100 - proteinPct - fatPct, avgProtein: Math.round(p / days.size), avgCarbs: Math.round(c / days.size), avgFat: Math.round(f / days.size), days: days.size };
}

/** Average kcal per logged day by meal type. */
export function byMealType(rows: FoodRow[]): { type: string; avgKcal: number }[] {
  const days = dailyTotals(rows).size || 1;
  const order = ["breakfast", "lunch", "snack", "dinner"];
  return order.map((type) => ({ type, avgKcal: Math.round(sum(rows.filter((r) => r.mealType === type).map((r) => r.kcal)) / days) })).filter((x) => x.avgKcal > 0);
}

/** Average eaten per ISO weekday (1=Mon..7=Sun), only over days that have logs. */
export function byWeekday(rows: FoodRow[]): { weekday: number; avgKcal: number | null; days: number }[] {
  const buckets: Record<number, number[]> = {};
  for (const [date, t] of dailyTotals(rows)) (buckets[isoWeekday(date)] ??= []).push(t.kcal);
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const xs = buckets[weekday] ?? [];
    return { weekday, avgKcal: xs.length ? Math.round(sum(xs) / xs.length) : null, days: xs.length };
  });
}

/** Foods ranked by total calories, with how many separate days they appeared on. */
export function topFoods(rows: FoodRow[], n = 8): { name: string; kcal: number; days: number; estimated: boolean }[] {
  const m = new Map<string, { kcal: number; days: Set<string>; estimated: boolean }>();
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    const e = m.get(key) ?? { kcal: 0, days: new Set<string>(), estimated: false };
    e.kcal += r.kcal; e.days.add(r.date); e.estimated ||= r.estimated;
    m.set(key, e);
  }
  const label = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r.name]));
  return [...m.entries()].map(([k, v]) => ({ name: label.get(k)!, kcal: Math.round(v.kcal), days: v.days.size, estimated: v.estimated })).sort((a, b) => b.kcal - a.kcal).slice(0, n);
}

/** Trailing moving average that ignores gaps (null) — used for the noisy daily weight series. */
export function movingAverage(values: (number | null)[], window = 7): (number | null)[] {
  return values.map((v, i) => {
    if (v === null) return null;
    const xs = values.slice(Math.max(0, i - window + 1), i + 1).filter((x): x is number => x !== null);
    return xs.length ? round1(sum(xs) / xs.length) : null;
  });
}

export interface DayStat { date: string; eaten: number; hasFood: boolean; burned: number | null; steps: number | null; sleepMinutes: number | null; weightKg: number | null }

/** Calendar-week (Mon–Sun) summaries. Averages use only days that have the data; balance needs both food and burn. */
export function weeklySummaries(days: DayStat[]): { weekStart: string; avgEaten: number | null; avgBurned: number | null; avgBalance: number | null; avgSteps: number | null; avgSleepH: number | null; weightKg: number | null; loggedDays: number }[] {
  const groups = new Map<string, DayStat[]>();
  for (const d of days) {
    const [y, m, dd] = d.date.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, dd - (isoWeekday(d.date) - 1))).toISOString().slice(0, 10);
    groups.set(start, [...(groups.get(start) ?? []), d]);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(sum(xs) / xs.length) : null);
  return [...groups.entries()].sort().map(([weekStart, ds]) => {
    const fed = ds.filter((d) => d.hasFood);
    const both = fed.filter((d) => d.burned !== null);
    const w = ds.filter((d) => d.weightKg !== null);
    const sleep = ds.filter((d) => d.sleepMinutes !== null).map((d) => d.sleepMinutes!);
    return {
      weekStart, loggedDays: fed.length,
      avgEaten: avg(fed.map((d) => d.eaten)), avgBurned: avg(both.map((d) => d.burned!)),
      avgBalance: avg(both.map((d) => d.eaten - d.burned!)), avgSteps: avg(ds.filter((d) => d.steps !== null).map((d) => d.steps!)),
      avgSleepH: sleep.length ? round1(sum(sleep) / sleep.length / 60) : null, weightKg: w.length ? round1(sum(w.map((d) => d.weightKg!)) / w.length) : null,
    };
  });
}

/** Days with kcal logged, as heat-map intensity 0..4 relative to the busiest day (0 = nothing logged). */
export function heatLevels(days: { date: string; kcal: number; hasFood: boolean }[]): { date: string; level: 0 | 1 | 2 | 3 | 4 }[] {
  const max = Math.max(1, ...days.filter((d) => d.hasFood).map((d) => d.kcal));
  return days.map((d) => ({ date: d.date, level: !d.hasFood ? 0 : ((Math.min(4, Math.max(1, Math.ceil((d.kcal / max) * 4))) as 1 | 2 | 3 | 4)) }));
}
