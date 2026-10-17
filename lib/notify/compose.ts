import type { InlineKeyboard } from "@/lib/telegram/api";
import { escapeHtml } from "@/lib/telegram/api";

export interface NudgeInput {
  /** real wall-clock hour in the user's timezone */
  hour: number;
  wakeHour: number;
  name: string | null;
  now: Date;
  date: string;
  mealsToday: number;
  lastMealAt: Date | null;
  eaten: number;
  target: number | null;
  openHabits: { id: string; name: string }[];
  workoutTitle: string | null; // planned today and not yet logged
  proteinG?: number | null;
  proteinTarget?: number | null;
  bankReasons: string[];
}

const kcal = (n: number) => Math.round(n).toLocaleString("en-IN");

/** One short, kind message — or null when there is nothing useful to say (no nagging). Never moralises about food. */
export function composeNudge(i: NudgeInput): { text: string; keyboard?: InlineKeyboard } | null {
  const lines: string[] = [];
  const keyboard: InlineKeyboard = [];
  const hoursSince = i.lastMealAt ? (i.now.getTime() - i.lastMealAt.getTime()) / 3_600_000 : null;

  if (i.mealsToday === 0 && i.hour < 11) {
    const bits = [i.target ? `Today's target is ${kcal(i.target)} kcal` : null, i.workoutTitle ? `workout: ${escapeHtml(i.workoutTitle)}` : null].filter(Boolean);
    lines.push(`Good morning${i.name ? `, ${escapeHtml(i.name)}` : ""} ☀️${bits.length ? ` ${bits.join(" · ")}.` : ""} Tell me when you've had breakfast.`);
  } else if (i.mealsToday === 0 && i.hour >= 11) {
    lines.push("Nothing logged yet today. Send me what you've eaten so far — a rough list is fine.");
  } else if (hoursSince !== null && hoursSince >= 3 && i.hour < 21) {
    lines.push(`It's been ${Math.floor(hoursSince)} hours since your last log. Eaten anything since?`);
  }

  if (i.mealsToday > 0 && i.target && i.hour >= 19) {
    const left = i.target - i.eaten;
    lines.push(left >= 0 ? `So far ${kcal(i.eaten)} kcal — ${kcal(left)} left for today.` : `So far ${kcal(i.eaten)} kcal, ${kcal(-left)} over today's target. The weekly average is what counts.`);
  }
  if (i.proteinTarget && i.hour >= 17 && i.mealsToday > 0 && (i.proteinG ?? 0) < i.proteinTarget * 0.6) {
    lines.push(`Protein is at ${Math.round(i.proteinG ?? 0)} g of ${i.proteinTarget} g. Dal, paneer, curd, eggs or sprouts would help with dinner.`);
  }
  if (i.bankReasons.length) lines.push(`Note: ${escapeHtml(i.bankReasons[0])}.`);

  if (i.openHabits.length && i.hour >= 12) {
    lines.push(`Still open today: ${i.openHabits.map((h) => escapeHtml(h.name)).join(", ")}. Tap to tick them off.`);
    for (const h of i.openHabits.slice(0, 6)) keyboard.push([{ text: `⬜ ${h.name}`.slice(0, 40), callback_data: `h|${h.id}|${i.date}` }]);
  }
  if (i.workoutTitle && i.hour >= 15) {
    lines.push(`Today's session is <b>${escapeHtml(i.workoutTitle)}</b>. Done it?`);
    keyboard.push([{ text: "✅ Mark workout done", callback_data: `w|${i.date}` }]);
  }

  if (!lines.length) return null;
  return { text: lines.join("\n\n"), keyboard: keyboard.length ? keyboard : undefined };
}

export interface ReviewInput {
  name: string | null;
  loggedDays: number;
  avgEaten: number | null;
  target: number | null;
  avgBalance: number | null;
  weightChangeKg: number | null;
  workouts: number;
  plannedWorkouts: number | null;
  habitPct: number | null;
  outUsed: number; outBudget: number; drinksUsed: number; drinksBudget: number;
  projection: string | null;
}

export function composeReview(r: ReviewInput): string {
  const l: string[] = [`📋 <b>Your week${r.name ? `, ${escapeHtml(r.name)}` : ""}</b>`];
  l.push(r.avgEaten == null ? "Food: nothing logged this week." : `Food: ${kcal(r.avgEaten)} kcal average over ${r.loggedDays} logged day${r.loggedDays === 1 ? "" : "s"}${r.target ? ` (target ${kcal(r.target)})` : ""}.`);
  if (r.avgBalance != null) l.push(`Balance: ${r.avgBalance > 0 ? "+" : ""}${kcal(r.avgBalance)} kcal/day on average (${r.avgBalance < 0 ? "deficit" : "surplus"}).`);
  if (r.weightChangeKg != null) l.push(`Weight: ${r.weightChangeKg > 0 ? "+" : ""}${r.weightChangeKg} kg this week.`);
  l.push(`Workouts: ${r.workouts}${r.plannedWorkouts ? ` of ${r.plannedWorkouts} planned` : ""}.`);
  if (r.habitPct != null) l.push(`Habits: ${r.habitPct}% done.`);
  l.push(`Social budget this month: eating out ${r.outUsed}/${r.outBudget}, drinks ${r.drinksUsed}/${r.drinksBudget}.`);
  if (r.projection) l.push(`\n${escapeHtml(r.projection)}`);
  // one focus: the thing furthest from plan, said kindly
  const focus = r.loggedDays < 5 ? "Log a little more often — even rough entries make the weekly average meaningful."
    : r.plannedWorkouts && r.workouts < r.plannedWorkouts ? "Protect your workout slots for next week; consistency beats intensity."
    : r.habitPct != null && r.habitPct < 70 ? "Pick the one habit that matters most and make it automatic first."
    : "Keep the routine as it is. It's working.";
  l.push(`\n<b>Focus next week:</b> ${focus}`);
  return l.join("\n");
}
