import { describe, expect, it } from "vitest";
import { parseIngestBody } from "@/lib/health/ingest";
import { averageBalance, dailyBalance, lastNDates } from "@/lib/health/balance";
import { habitStreak, isScheduled, isoWeekday, describeWeekdays } from "@/lib/habits/schedule";
import { extractTags } from "@/lib/journal/mood";

const NOW = new Date("2026-10-17T12:00:00Z");

describe("health ingest validation", () => {
  it("accepts one day and coerces Shortcut-style strings", () => {
    const r = parseIngestBody({ date: "2026-10-17", active_kcal: "512.4", resting_kcal: "1,640", steps: "8421.6" }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.days[0]).toMatchObject({ active_kcal: 512.4, resting_kcal: 1640, steps: 8422 });
  });

  it("treats blank strings as absent — never as 0", () => {
    const r = parseIngestBody({ date: "2026-10-17", steps: "5000", active_kcal: "", weight_kg: null }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.days[0].active_kcal).toBeUndefined();
      expect(r.days[0].weight_kg).toBeUndefined();
    }
  });

  it("rejects days with no metrics, bad dates, future dates and out-of-range values", () => {
    expect(parseIngestBody({ date: "2026-10-17" }, NOW).ok).toBe(false);
    expect(parseIngestBody({ date: "17-10-2026", steps: 1 }, NOW).ok).toBe(false);
    expect(parseIngestBody({ date: "2026-12-25", steps: 1 }, NOW).ok).toBe(false);
    expect(parseIngestBody({ date: "2026-10-17", steps: 9_999_999 }, NOW).ok).toBe(false);
    expect(parseIngestBody({ date: "2026-10-17", weight_kg: 5 }, NOW).ok).toBe(false);
    expect(parseIngestBody({ date: "2026-10-17", steps: "abc" }, NOW).ok).toBe(false);
    expect(parseIngestBody(null, NOW).ok).toBe(false);
  });

  it("accepts a backfill and de-duplicates the same date (last wins)", () => {
    const r = parseIngestBody({ days: [{ date: "2026-10-15", steps: 1 }, { date: "2026-10-16", steps: 2 }, { date: "2026-10-15", steps: 3 }] }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.days.find((d) => d.date === "2026-10-15")!.steps).toBe(3);
    expect(parseIngestBody({ days: [] }, NOW).ok).toBe(false);
  });

  it("validates workouts", () => {
    expect(parseIngestBody({ date: "2026-10-17", workouts: [{ type: "Running", minutes: "32", kcal: 300 }] }, NOW).ok).toBe(true);
    expect(parseIngestBody({ date: "2026-10-17", workouts: [{ minutes: 5 }] }, NOW).ok).toBe(false);
  });
});

describe("daily balance", () => {
  it("is eaten − (resting + active), labelled surplus/deficit", () => {
    expect(dailyBalance({ eaten: 2200, activeKcal: 400, restingKcal: 1700 })).toMatchObject({ kind: "balance", burned: 2100, balance: 100, label: "surplus" });
    expect(dailyBalance({ eaten: 1500, activeKcal: 400, restingKcal: 1700 })).toMatchObject({ balance: -600, label: "deficit" });
  });

  it("says 'no burn data' instead of treating missing burn as zero", () => {
    expect(dailyBalance({ eaten: 1800, activeKcal: null, restingKcal: null }).kind).toBe("no_burn_data");
    expect(dailyBalance({ eaten: 1800, activeKcal: 300, restingKcal: null }).kind).toBe("no_burn_data");
  });

  it("averages only days with burn data AND logged food", () => {
    const days = [
      { date: "a", eaten: 2000, hasFood: true, activeKcal: 300, restingKcal: 1700 }, // 0
      { date: "b", eaten: 2400, hasFood: true, activeKcal: 300, restingKcal: 1700 }, // +400
      { date: "c", eaten: 0, hasFood: false, activeKcal: 300, restingKcal: 1700 }, // untracked: skipped
      { date: "d", eaten: 1900, hasFood: true, activeKcal: null, restingKcal: null }, // no burn: skipped
    ];
    expect(averageBalance(days)).toEqual({ average: 200, daysCounted: 2, daysInWindow: 4 });
    expect(averageBalance([]).average).toBeNull();
  });

  it("builds a window of local dates, oldest first, across month boundaries", () => {
    expect(lastNDates("2026-03-02", 4)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});

describe("habits", () => {
  it("computes ISO weekdays", () => {
    expect(isoWeekday("2026-10-17")).toBe(6); // Saturday
    expect(isoWeekday("2026-10-18")).toBe(7); // Sunday
    expect(isoWeekday("2026-10-19")).toBe(1);
  });

  it("schedules by weekday; null = every day", () => {
    expect(isScheduled(null, "2026-10-17")).toBe(true);
    expect(isScheduled([1, 3, 5], "2026-10-19")).toBe(true);
    expect(isScheduled([1, 3, 5], "2026-10-20")).toBe(false);
    expect(describeWeekdays([1, 3, 5])).toBe("Mon · Wed · Fri");
  });

  it("counts a daily streak, and today still open doesn't break it", () => {
    const done = new Set(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(habitStreak(null, done, "2026-10-17")).toBe(3);
    expect(habitStreak(null, new Set([...done, "2026-10-17"]), "2026-10-17")).toBe(4);
    expect(habitStreak(null, new Set(["2026-10-14"]), "2026-10-17")).toBe(0); // a missed day breaks it
  });

  it("skips unscheduled days for weekday habits (Mon/Wed/Fri)", () => {
    // Fri 16, Wed 14, Mon 12 all done; Sat 17 unscheduled
    const done = new Set(["2026-10-16", "2026-10-14", "2026-10-12"]);
    expect(habitStreak([1, 3, 5], done, "2026-10-17")).toBe(3);
    expect(habitStreak([1, 3, 5], new Set(["2026-10-16", "2026-10-12"]), "2026-10-17")).toBe(1); // missed Wed
  });
});

describe("journal tags", () => {
  it("extracts unique lowercase tags incl. Indic scripts", () => {
    expect(extractTags("Long day #Work #family #work")).toEqual(["work", "family"]);
    expect(extractTags("ಇಂದು #ಕೆಲಸ ಮತ್ತು #परिवार")).toEqual(["ಕೆಲಸ", "परिवार"]);
    expect(extractTags("no tags here, email a#b")).toEqual([]);
  });
});
