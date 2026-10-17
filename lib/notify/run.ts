import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCoach } from "@/lib/coach/load";
import { projectGoal } from "@/lib/coach/projection";
import { confirmedLogsForDay } from "@/lib/db/meals";
import { habitCompletion } from "@/lib/db/insights";
import { habitStatuses, healthRange, trend } from "@/lib/db/life";
import { listEvents, targetForDay } from "@/lib/db/social";
import { hasSession, sessionsSince } from "@/lib/db/workouts";
import { averageBalance, lastNDates } from "@/lib/health/balance";
import { isoWeekday } from "@/lib/habits/schedule";
import { monthUsage } from "@/lib/social/budget";
import { sendMessage } from "@/lib/telegram/api";
import { localDateString, localHour, zoneWithDayStart } from "@/lib/time/day";
import { composeNudge, composeReview } from "./compose";

/** Minimum gap between nudges. The cron runs hourly; 170 min lets a ~3-hourly rhythm survive scheduling drift. */
const MIN_GAP_MS = 170 * 60_000;

interface Row { id: string; display_name: string | null; timezone: string; day_start_hour: number; calorie_target: number | null; wake_hour: number; sleep_hour: number; paused_until: string | null; last_nudge_at: string | null; last_review_on: string | null; monthly_out_budget: number; monthly_drink_budget: number }

/** Called by the hourly cron. Sends at most one message per user, only when there is something worth saying. */
export async function runNudges(db: SupabaseClient, now = new Date()): Promise<{ checked: number; sent: number; reviews: number; errors: number }> {
  const stats = { checked: 0, sent: 0, reviews: 0, errors: 0 };
  const { data: links, error } = await db.from("telegram_links").select("user_id, chat_id");
  if (error) throw new Error(error.message);
  if (!links?.length) return stats;
  const { data: profiles, error: pe } = await db.from("profiles").select("id, display_name, timezone, day_start_hour, calorie_target, wake_hour, sleep_hour, paused_until, last_nudge_at, last_review_on, monthly_out_budget, monthly_drink_budget").eq("nudges_enabled", true).in("id", links.map((l) => l.user_id));
  if (pe) throw new Error(pe.message);

  for (const p of (profiles ?? []) as Row[]) {
    const chatId = links.find((l) => l.user_id === p.id)!.chat_id as number;
    stats.checked++;
    try {
      const r = await nudgeUser(db, p, chatId, now);
      if (r === "nudge") stats.sent++;
      if (r === "review") stats.reviews++;
    } catch (e) {
      stats.errors++;
      console.error("nudge failed", p.id, e);
    }
  }
  return stats;
}

async function nudgeUser(db: SupabaseClient, p: Row, chatId: number, now: Date): Promise<"nudge" | "review" | "none"> {
  if (p.paused_until && new Date(p.paused_until) > now) return "none";
  const zone = zoneWithDayStart(p.timezone, p.day_start_hour);
  const hour = localHour(now, zone);
  if (hour < p.wake_hour || hour >= p.sleep_hour) return "none";
  const date = localDateString(now, zone);
  const name = p.display_name;

  // Sunday evening: the weekly review, once
  if (isoWeekday(date) === 7 && hour >= 19 && p.last_review_on !== date) {
    await sendMessage(chatId, await buildReview(db, p, zone, date));
    await db.from("profiles").update({ last_review_on: date, last_nudge_at: now.toISOString() }).eq("id", p.id);
    return "review";
  }

  if (p.last_nudge_at && now.getTime() - new Date(p.last_nudge_at).getTime() < MIN_GAP_MS) return "none";

  const [logs, habits, coach, trained] = await Promise.all([
    confirmedLogsForDay(db, p.id, zone, now),
    habitStatuses(db, p.id, date),
    loadCoach(db, p.id, date),
    hasSession(db, p.id, date),
  ]);
  const eaten = Math.round(logs.reduce((s, l) => s + Number(l.total_kcal), 0));
  const protein = logs.reduce((s, l) => s + l.items.reduce((a, i) => a + Number(i.protein_g), 0), 0);
  const lastMealAt = logs.length ? new Date(Math.max(...logs.map((l) => new Date(l.logged_at).getTime()))) : null;
  const adj = await targetForDay(db, p.id, date, p.calorie_target);
  const dayPlan = coach?.plan?.days.find((d) => d.weekday === isoWeekday(date));

  const msg = composeNudge({
    hour, wakeHour: p.wake_hour, name, now, date,
    mealsToday: logs.length, lastMealAt, eaten, target: adj.target,
    openHabits: habits.filter((h) => h.scheduled && !h.done).map((h) => ({ id: h.id, name: `${h.emoji} ${h.name}`.trim() })),
    workoutTitle: dayPlan && !trained ? dayPlan.title : null,
    proteinG: protein, proteinTarget: coach?.result.ok ? coach.result.proteinG : null,
    bankReasons: adj.reasons,
  });
  if (!msg) return "none";
  await sendMessage(chatId, msg.text, msg.keyboard);
  await db.from("profiles").update({ last_nudge_at: now.toISOString() }).eq("id", p.id);
  return "nudge";
}

async function buildReview(db: SupabaseClient, p: Row, zone: string, date: string): Promise<string> {
  const dates = lastNDates(date, 7);
  const [days, habits, coach, sessions, events] = await Promise.all([
    trend(db, p.id, zone, date, 7),
    habitCompletion(db, p.id, zone, dates),
    loadCoach(db, p.id, date),
    sessionsSince(db, p.id, dates[0]),
    listEvents(db, p.id, `${date.slice(0, 7)}-01`, `${date.slice(0, 7)}-31`),
  ]);
  const fed = days.filter((d) => d.hasFood);
  const weights = days.filter((d) => d.weightKg != null);
  const used = monthUsage(events, date.slice(0, 7));
  const sched = habits.reduce((s, h) => s + h.scheduled, 0);
  let projection: string | null = null;
  if (coach) {
    const since = new Date(Date.parse(`${date}T00:00:00Z`) - 35 * 86_400_000).toISOString().slice(0, 10);
    const w = (await healthRange(db, p.id, since, date)).filter((r) => r.weight_kg != null).map((r) => ({ date: r.date, kg: Number(r.weight_kg) }));
    projection = projectGoal(w, coach.profile.goal_weight_kg, coach.profile.goal_date, date).message;
  }
  return composeReview({
    name: p.display_name, loggedDays: fed.length,
    avgEaten: fed.length ? fed.reduce((s, d) => s + d.eaten, 0) / fed.length : null, target: p.calorie_target,
    avgBalance: averageBalance(days).average,
    weightChangeKg: weights.length >= 2 ? Math.round((weights[weights.length - 1].weightKg! - weights[0].weightKg!) * 10) / 10 : null,
    workouts: sessions.length, plannedWorkouts: coach?.profile.days_per_week ?? null,
    habitPct: sched ? Math.round((habits.reduce((s, h) => s + h.done, 0) * 100) / sched) : null,
    outUsed: used.out, outBudget: p.monthly_out_budget, drinksUsed: used.drinks, drinksBudget: p.monthly_drink_budget, projection,
  });
}
