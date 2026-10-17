import { describe, expect, it } from "vitest";
import { byMealType, byWeekday, dailyTotals, heatLevels, macroShare, movingAverage, topFoods, weeklySummaries, type FoodRow } from "@/lib/analytics/stats";

const row = (date: string, kcal: number, p = 0, c = 0, f = 0, over: Partial<FoodRow> = {}): FoodRow => ({ date, mealType: "lunch", name: "Rice", kcal, protein: p, carbs: c, fat: f, estimated: false, ...over });

describe("analytics", () => {
  const rows = [row("2026-10-12", 500, 20, 60, 15), row("2026-10-12", 300, 10, 40, 5, { mealType: "dinner", name: "Roti" }), row("2026-10-13", 600, 25, 70, 20, { mealType: "breakfast", name: "Dosa" })];

  it("sums per day", () => {
    expect(dailyTotals(rows).get("2026-10-12")).toEqual({ kcal: 800, protein: 30, carbs: 100, fat: 20 });
  });
  it("macro share sums to exactly 100 and reports daily averages", () => {
    const m = macroShare(rows)!;
    expect(m.proteinPct + m.carbsPct + m.fatPct).toBe(100);
    expect(m.days).toBe(2);
    expect(m.avgProtein).toBe(28); // 55 g over 2 days
    expect(macroShare([])).toBeNull();
    expect(macroShare([row("2026-10-12", 100)])).toBeNull(); // no macro data
  });
  it("averages meal types per logged day", () => {
    const r = byMealType(rows);
    expect(r.find((x) => x.type === "lunch")!.avgKcal).toBe(250);
    expect(r.find((x) => x.type === "breakfast")!.avgKcal).toBe(300);
  });
  it("averages by weekday only over days that have logs", () => {
    const w = byWeekday(rows); // 12 Oct 2026 = Monday, 13 = Tuesday
    expect(w[0]).toEqual({ weekday: 1, avgKcal: 800, days: 1 });
    expect(w[1].avgKcal).toBe(600);
    expect(w[2].avgKcal).toBeNull();
  });
  it("ranks top foods by total kcal and counts distinct days", () => {
    const t = topFoods([...rows, row("2026-10-13", 400)]);
    expect(t[0]).toMatchObject({ name: "Rice", kcal: 900, days: 2 });
    expect(t.map((x) => x.name)).toEqual(["Rice", "Dosa", "Roti"]);
  });
  it("moving average ignores gaps and keeps null days null", () => {
    expect(movingAverage([70, null, 72, 71], 3)).toEqual([70, null, 71, 71.5]);
  });
  it("weekly summaries: balance needs both food and burn", () => {
    const days = [
      { date: "2026-10-12", eaten: 2000, hasFood: true, burned: 2200, steps: 8000, sleepMinutes: 420, weightKg: 70 },
      { date: "2026-10-13", eaten: 0, hasFood: false, burned: 2200, steps: 6000, sleepMinutes: null, weightKg: null },
      { date: "2026-10-14", eaten: 2400, hasFood: true, burned: null, steps: null, sleepMinutes: 480, weightKg: 69 },
      { date: "2026-10-19", eaten: 1800, hasFood: true, burned: 2000, steps: null, sleepMinutes: null, weightKg: null },
    ];
    const w = weeklySummaries(days);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ weekStart: "2026-10-12", loggedDays: 2, avgEaten: 2200, avgBalance: -200, avgSteps: 7000, avgSleepH: 7.5, weightKg: 69.5 });
    expect(w[1].weekStart).toBe("2026-10-19");
  });
  it("heat levels: 0 for untracked days, 1-4 scaled to the busiest day", () => {
    const h = heatLevels([{ date: "a", kcal: 0, hasFood: false }, { date: "b", kcal: 500, hasFood: true }, { date: "c", kcal: 2000, hasFood: true }]);
    expect(h.map((x) => x.level)).toEqual([0, 1, 4]);
  });
});
