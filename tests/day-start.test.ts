import { describe, expect, it } from "vitest";
import { dayBounds, localDateString, localHour, zoneWithDayStart } from "@/lib/time/day";

const IST = zoneWithDayStart("Asia/Kolkata", 4);
// 1:30 AM IST on 18 Oct = 20:00 UTC on 17 Oct
const lateNight = new Date("2026-10-17T20:00:00Z");

describe("day start hour", () => {
  it("counts before-4AM as the previous day", () => {
    expect(localDateString(lateNight, "Asia/Kolkata")).toBe("2026-10-18");
    expect(localDateString(lateNight, IST)).toBe("2026-10-17");
  });
  it("starts the new day at 4 AM", () => {
    expect(localDateString(new Date("2026-10-17T22:30:00Z"), IST)).toBe("2026-10-18"); // 4:00 AM IST
    expect(localDateString(new Date("2026-10-17T22:29:00Z"), IST)).toBe("2026-10-17"); // 3:59 AM IST
  });
  it("bounds the day from 4 AM to 4 AM", () => {
    const { start, end } = dayBounds(lateNight, IST);
    expect(start.toISOString()).toBe("2026-10-16T22:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-17T22:30:00.000Z");
  });
  it("leaves plain timezones and the real wall-clock hour alone", () => {
    expect(dayBounds(lateNight, "Asia/Kolkata").start.toISOString()).toBe("2026-10-17T18:30:00.000Z");
    expect(localHour(lateNight, IST)).toBe(1);
    expect(zoneWithDayStart("Asia/Kolkata", 0)).toBe("Asia/Kolkata");
  });
});
