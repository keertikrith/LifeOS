import { describe, expect, it } from "vitest";
import { bmr, computeCoachPlan, progressCheck, type CoachInput } from "@/lib/coach/calc";

const base: CoachInput = { sex: "male", age: 30, heightCm: 175, weightKg: 85, goalWeightKg: 75, activity: "light", today: "2026-10-17" };

describe("coach calories", () => {
  it("computes Mifflin-St Jeor BMR", () => {
    expect(Math.round(bmr({ sex: "male", age: 30, heightCm: 175, weightKg: 85 }))).toBe(1799); // 850+1093.75-150+5
    expect(Math.round(bmr({ sex: "female", age: 30, heightCm: 160, weightKg: 60 }))).toBe(1289); // 600+1000-150-161
  });

  it("plans a safe deficit for weight loss and keeps macros consistent", () => {
    const r = computeCoachPlan(base);
    if (!r.ok) throw new Error(r.reason);
    expect(r.direction).toBe("lose");
    expect(r.maintenance).toBeGreaterThan(r.targetKcal);
    expect(r.weeklyKg).toBeGreaterThanOrEqual(-0.85); // <= 1% of 85 kg
    expect(r.weeklyKg).toBeLessThan(0);
    const kcalFromMacros = r.proteinG * 4 + r.carbsG * 4 + r.fatG * 9;
    expect(Math.abs(kcalFromMacros - r.targetKcal)).toBeLessThan(60);
    expect(r.weeksToGoal).toBe(Math.ceil(10 / Math.abs(r.weeklyKg)));
  });

  it("never goes below the calorie floor", () => {
    const r = computeCoachPlan({ ...base, sex: "female", age: 55, heightCm: 150, weightKg: 52, goalWeightKg: 46, activity: "sedentary" });
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetKcal).toBeGreaterThanOrEqual(1200);
  });

  it("caps an over-aggressive target date and explains why", () => {
    const r = computeCoachPlan({ ...base, goalDate: "2026-11-17" }); // 10 kg in a month
    if (!r.ok) throw new Error(r.reason);
    expect(Math.abs(r.weeklyKg)).toBeLessThanOrEqual(0.85);
    expect(r.notes.join(" ")).toMatch(/faster than is safe/);
    expect(r.etaDate! > "2026-11-17").toBe(true);
  });

  it("honours a reasonable date", () => {
    const r = computeCoachPlan({ ...base, goalDate: "2027-03-17" }); // ~21 weeks
    if (!r.ok) throw new Error(r.reason);
    expect(Math.abs(r.weeklyKg)).toBeGreaterThan(0.3);
    expect(Math.abs(r.weeklyKg)).toBeLessThan(0.6);
  });

  it("plans a modest surplus for gaining", () => {
    const r = computeCoachPlan({ ...base, weightKg: 58, goalWeightKg: 64 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.direction).toBe("gain");
    expect(r.dailyDeltaKcal).toBeGreaterThan(0);
    expect(r.dailyDeltaKcal).toBeLessThanOrEqual(560);
  });

  it("maintains when already at goal", () => {
    const r = computeCoachPlan({ ...base, goalWeightKg: 85.2 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.direction).toBe("maintain");
    expect(r.targetKcal).toBe(Math.round(r.maintenance / 10) * 10);
  });

  it("refuses unsafe or invalid inputs", () => {
    expect(computeCoachPlan({ ...base, age: 16 }).ok).toBe(false);
    const low = computeCoachPlan({ ...base, goalWeightKg: 50 }); // BMI 16.3
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.reason).toMatch(/healthy BMI/);
    expect(computeCoachPlan({ ...base, heightCm: 20 }).ok).toBe(false);
  });
});

describe("progress check", () => {
  it("says on track when real change matches the plan", () => {
    const r = progressCheck([{ date: "2026-10-01", kg: 85 }, { date: "2026-10-29", kg: 83 }], -0.5);
    expect(r!.actualWeeklyKg).toBe(-0.5);
    expect(r!.message).toMatch(/on track/);
  });
  it("flags slower-than-planned progress without suggesting extreme cuts", () => {
    const r = progressCheck([{ date: "2026-10-01", kg: 85 }, { date: "2026-10-29", kg: 85 }], -0.5);
    expect(r!.message).toMatch(/slower/);
    expect(r!.message).toMatch(/logging/);
  });
  it("returns null with too little data", () => {
    expect(progressCheck([{ date: "2026-10-01", kg: 85 }], -0.5)).toBeNull();
    expect(progressCheck([{ date: "2026-10-01", kg: 85 }, { date: "2026-10-05", kg: 84 }], -0.5)).toBeNull();
  });
});

import { buildWorkoutPlan } from "@/lib/coach/workouts";

describe("workout plans", () => {
  const mk = (days: number, equipment: "home" | "gym" = "home", experience: "beginner" | "intermediate" = "beginner") =>
    buildWorkoutPlan({ daysPerWeek: days, equipment, experience, direction: "lose", stepsGoal: 8000 });

  it("produces the requested number of distinct training days, on valid weekdays, with rest days between", () => {
    for (const d of [2, 3, 4, 5, 6]) {
      const p = mk(d);
      expect(p.days).toHaveLength(d);
      expect(new Set(p.days.map((x) => x.weekday)).size).toBe(d);
      expect(p.days.every((x) => x.weekday >= 1 && x.weekday <= 7)).toBe(true);
    }
    const three = mk(3).days.map((x) => x.weekday);
    expect(three).toEqual([1, 3, 5]); // never consecutive
  });
  it("never repeats an exercise inside one session and always has sets/reps", () => {
    for (const eq of ["home", "gym"] as const) for (const d of [3, 4, 6]) for (const day of mk(d, eq, "intermediate").days) {
      const names = day.exercises.map((e) => e.name);
      expect(new Set(names).size).toBe(names.length);
      expect(day.exercises.every((e) => e.sets >= 3 && e.reps.length > 0)).toBe(true);
    }
  });
  it("home plans need no gym equipment", () => {
    const text = mk(5, "home").days.flatMap((d) => d.exercises.map((e) => e.name)).join(" ").toLowerCase();
    expect(text).not.toMatch(/barbell|cable|lat pulldown|leg press|dumbbell/);
  });
  it("adds cardio guidance by goal and clamps odd day counts", () => {
    expect(mk(3).cardio.join(" ")).toMatch(/8,000 steps/);
    expect(buildWorkoutPlan({ daysPerWeek: 9, equipment: "gym", experience: "beginner", direction: "gain", stepsGoal: 7000 }).days).toHaveLength(6);
  });
});
