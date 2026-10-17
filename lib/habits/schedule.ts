/** Habit scheduling and streaks. Weekdays are ISO (1=Mon..7=Sun); null means every day. Dates are local YYYY-MM-DD. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

export const isScheduled = (weekdays: number[] | null, date: string) => !weekdays || weekdays.length === 0 || weekdays.includes(isoWeekday(date));

const prevDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

/**
 * Current streak: consecutive SCHEDULED days completed, ending today. Today doesn't break the streak while it's
 * still open (not yet done); unscheduled days are skipped, neither extending nor breaking it.
 */
export function habitStreak(weekdays: number[] | null, done: Set<string>, today: string): number {
  let streak = 0;
  let cursor = today;
  if (isScheduled(weekdays, today) && !done.has(today)) cursor = prevDay(today);
  for (let guard = 0; guard < 800; guard++) {
    if (isScheduled(weekdays, cursor)) {
      if (!done.has(cursor)) break;
      streak++;
    }
    cursor = prevDay(cursor);
  }
  return streak;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const describeWeekdays = (w: number[] | null) =>
  !w || w.length === 0 || w.length === 7 ? "Every day" : [...w].sort().map((n) => WEEKDAY_LABELS[n - 1]).join(" · ");
