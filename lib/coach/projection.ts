/** Where is the weight heading? Least-squares slope over recent weigh-ins, compared with the user's target date. Neutral wording. */
const DAY = 86_400_000;
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

export interface Projection {
  /** kg per week; negative = losing */
  slopeKgPerWeek: number;
  /** date the goal would be reached at the current pace, or null if not heading there */
  projectedDate: string | null;
  /** weeks ahead (+) or behind (−) the user's target date; null with no target date */
  weeksVsTarget: number | null;
  status: "ahead" | "on_track" | "behind" | "off_direction" | "reached" | "not_enough_data";
  message: string;
}

export function projectGoal(weights: { date: string; kg: number }[], goalKg: number, goalDate: string | null, today: string, windowDays = 28): Projection {
  const pts = weights.filter((w) => dayNum(w.date) > dayNum(today) - windowDays && w.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const none = (message: string): Projection => ({ slopeKgPerWeek: 0, projectedDate: null, weeksVsTarget: null, status: "not_enough_data", message });
  if (pts.length < 3 || dayNum(pts[pts.length - 1].date) - dayNum(pts[0].date) < 7) return none("Log your weight a few times over a week or more and I'll project where you're heading.");

  const xs = pts.map((p) => dayNum(p.date)), ys = pts.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx; // kg per day
  const current = my + slope * (dayNum(today) - mx); // smoothed current weight
  const slopeKgPerWeek = Math.round(slope * 7 * 100) / 100;
  const remaining = goalKg - current;

  if (Math.abs(remaining) < 0.5) return { slopeKgPerWeek, projectedDate: today, weeksVsTarget: null, status: "reached", message: "You're at your goal weight. Now it's about keeping it steady." };
  const heading = Math.sign(slope) === Math.sign(remaining) && Math.abs(slope) > 0.005;
  if (!heading) return { slopeKgPerWeek, projectedDate: null, weeksVsTarget: null, status: "off_direction", message: "Over the last few weeks your weight hasn't been moving toward the goal. A few weigh-ins are noisy — the weekly average matters more, and small changes to portions or steps usually move it." };

  const projected = isoOf(Math.round(dayNum(today) + remaining / slope));
  const pretty = new Date(`${projected}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  if (!goalDate) return { slopeKgPerWeek, projectedDate: projected, weeksVsTarget: null, status: "on_track", message: `At your recent pace you'd reach ${goalKg} kg around ${pretty}.` };

  const weeks = Math.round(((dayNum(goalDate) - dayNum(projected)) / 7) * 10) / 10;
  const status = weeks >= 2 ? "ahead" : weeks <= -2 ? "behind" : "on_track";
  const tail = status === "ahead" ? `about ${weeks} weeks ahead of your target date` : status === "behind" ? `about ${-weeks} weeks after your target date` : "right around your target date";
  return { slopeKgPerWeek, projectedDate: projected, weeksVsTarget: weeks, status, message: `At your recent pace you'd reach ${goalKg} kg around ${pretty} — ${tail}.${status === "behind" ? " Consistency over the next few weeks closes this gap more than any single change." : ""}` };
}

export interface Milestone { label: string; achieved: boolean }

/** Weight steps every 2 kg toward the goal, plus workout and logging-streak counts. */
export function milestones(i: { startKg: number; currentKg: number; goalKg: number; workouts: number; bestStreakDays: number }): Milestone[] {
  const out: Milestone[] = [];
  const dir = Math.sign(i.goalKg - i.startKg);
  if (dir !== 0) {
    const total = Math.abs(i.goalKg - i.startKg);
    const moved = Math.max(0, (i.currentKg - i.startKg) * dir);
    for (let s = 2; s < total; s += 2) out.push({ label: `${s} kg ${dir < 0 ? "down" : "up"}`, achieved: moved >= s });
    out.push({ label: `Goal weight ${i.goalKg} kg`, achieved: moved >= total - 0.25 });
  }
  for (const n of [1, 10, 25, 50, 100]) out.push({ label: n === 1 ? "First workout logged" : `${n} workouts logged`, achieved: i.workouts >= n });
  for (const n of [7, 30, 100]) out.push({ label: `${n}-day logging streak`, achieved: i.bestStreakDays >= n });
  return out;
}
