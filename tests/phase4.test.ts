import { describe, expect, it } from "vitest";
import { adjustedTarget, bankedFor, monthUsage, parseWhen } from "@/lib/social/budget";
import { lastWeeks, liftProgress, parseLift, sessionsPerWeek, topLifts, volumePerWeek, weekStart } from "@/lib/workouts/stats";
import { milestones, projectGoal } from "@/lib/coach/projection";

const ev = (date: string, allowance = 600, created_on = "2026-10-01") => ({ date, kind: "out" as const, allowance_kcal: allowance, created_on });

describe("social budget", () => {
  it("banks from the 3 days before and pays out on the day", () => {
    const events = [ev("2026-10-25")];
    expect(adjustedTarget(2000, "2026-10-23", events).target).toBe(1800);
    expect(adjustedTarget(2000, "2026-10-24", events).target).toBe(1800);
    expect(adjustedTarget(2000, "2026-10-22", events).target).toBe(1800);
    expect(adjustedTarget(2000, "2026-10-21", events).target).toBe(2000);
    expect(adjustedTarget(2000, "2026-10-25", events).target).toBe(2600);
  });
  it("caps the daily trim at 15% and only banks what it trimmed", () => {
    const events = [ev("2026-10-25", 1500)];
    expect(adjustedTarget(2000, "2026-10-24", events).target).toBe(1700);
    expect(bankedFor(2000, events[0])).toBe(900);
  });
  it("cannot trim days before the event was created", () => {
    const e = ev("2026-10-25", 600, "2026-10-24");
    expect(adjustedTarget(2000, "2026-10-23", [e]).target).toBe(2000);
    expect(adjustedTarget(2000, "2026-10-24", [e]).target).toBe(1800);
    expect(adjustedTarget(2000, "2026-10-25", [e]).target).toBe(2200);
  });
  it("leaves a missing target alone and counts the month", () => {
    expect(adjustedTarget(null, "2026-10-24", [ev("2026-10-25")]).target).toBeNull();
    expect(monthUsage([ev("2026-10-25"), { date: "2026-10-03", kind: "drinks" }, { date: "2026-11-01", kind: "out" }], "2026-10")).toEqual({ out: 1, drinks: 1 });
  });
  it("parses when", () => {
    expect(parseWhen(undefined, "2026-10-18")).toBe("2026-10-18");
    expect(parseWhen("tomorrow", "2026-10-18")).toBe("2026-10-19");
    expect(parseWhen("sat", "2026-10-18")).toBe("2026-10-24"); // 18 Oct 2026 is a Sunday
    expect(parseWhen("sunday", "2026-10-18")).toBe("2026-10-25");
    expect(parseWhen("blah", "2026-10-18")).toBeNull();
  });
});

describe("workout stats", () => {
  it("buckets by Monday weeks", () => {
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    const weeks = lastWeeks("2026-10-18", 3);
    expect(weeks).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(sessionsPerWeek([{ date: "2026-10-13" }, { date: "2026-10-18" }, { date: "2026-10-06" }], weeks).map((w) => w.value)).toEqual([0, 1, 2]);
  });
  it("sums volume and ignores bodyweight sets", () => {
    const rows = [{ date: "2026-10-13", exercise: "Bench", sets: 3, reps: 8, weight_kg: 40 }, { date: "2026-10-13", exercise: "Push-ups", sets: 3, reps: 10, weight_kg: null }];
    expect(volumePerWeek(rows, ["2026-10-12"])[0].value).toBe(960);
  });
  it("tracks lift progress and top lifts", () => {
    const rows = [
      { date: "2026-10-01", exercise: "Bench Press", sets: 3, reps: 8, weight_kg: 40 },
      { date: "2026-10-08", exercise: "bench press", sets: 3, reps: 8, weight_kg: 42.5 },
      { date: "2026-10-08", exercise: "bench press", sets: 1, reps: 5, weight_kg: 45 },
      { date: "2026-10-08", exercise: "Squat", sets: 3, reps: 8, weight_kg: 60 },
    ];
    expect(liftProgress(rows, "Bench press")).toEqual([{ date: "2026-10-01", value: 40 }, { date: "2026-10-08", value: 45 }]);
    expect(topLifts(rows, 1)).toEqual(["Bench Press"]);
  });
  it("parses /lift text", () => {
    expect(parseLift("bench press 3x8 40")).toEqual({ exercise: "bench press", sets: 3, reps: 8, weight_kg: 40 });
    expect(parseLift("squats 4 x 10 62.5kg")).toEqual({ exercise: "squats", sets: 4, reps: 10, weight_kg: 62.5 });
    expect(parseLift("plank 3x45")).toEqual({ exercise: "plank", sets: 3, reps: 45, weight_kg: null });
    expect(parseLift("hello")).toBeNull();
  });
});

describe("projection", () => {
  const series = (start: number, perWeek: number, days: number) => Array.from({ length: days }, (_, i) => ({ date: new Date(Date.parse("2026-09-20T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10), kg: start + (perWeek / 7) * i }));
  it("needs data", () => expect(projectGoal(series(80, -0.5, 2), 70, null, "2026-10-18").status).toBe("not_enough_data"));
  it("projects a loss and compares with the target date", () => {
    const w = series(80, -0.5, 29); // 20 Sep .. 18 Oct, ends ~78
    const p = projectGoal(w, 70, "2027-12-31", "2026-10-18");
    expect(p.slopeKgPerWeek).toBeCloseTo(-0.5, 1);
    expect(p.status).toBe("ahead");
    expect(projectGoal(w, 70, "2026-12-01", "2026-10-18").status).toBe("behind");
  });
  it("flags the wrong direction neutrally", () => {
    const p = projectGoal(series(80, 0.4, 29), 70, null, "2026-10-18");
    expect(p.status).toBe("off_direction");
    expect(p.message).not.toMatch(/bad|fail/i);
  });
  it("builds milestones", () => {
    const m = milestones({ startKg: 80, currentKg: 76.5, goalKg: 70, workouts: 12, bestStreakDays: 8 });
    expect(m.find((x) => x.label === "2 kg down")?.achieved).toBe(true);
    expect(m.find((x) => x.label === "4 kg down")?.achieved).toBe(false);
    expect(m.find((x) => x.label === "10 workouts logged")?.achieved).toBe(true);
    expect(m.find((x) => x.label === "30-day logging streak")?.achieved).toBe(false);
  });
});
