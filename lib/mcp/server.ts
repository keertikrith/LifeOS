import type { SupabaseClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadCoach } from "@/lib/coach/load";
import { projectGoal } from "@/lib/coach/projection";
import { logSession, sessionsSince, type LiftInput } from "@/lib/db/workouts";
import { createLog, deleteLog, loadCatalog, recomputeTotal, setLogStatus } from "@/lib/db/meals";
import { habitStatuses, healthRange, mealsForDate, saveJournal, setHabitDone, trend } from "@/lib/db/life";
import { addEvent, listEvents, targetForDay } from "@/lib/db/social";
import { averageBalance, dailyBalance } from "@/lib/health/balance";
import { saveHealthManual } from "@/lib/health/manual";
import { isoWeekday } from "@/lib/habits/schedule";
import { matchedItem } from "@/lib/nutrition/build";
import { normalize } from "@/lib/nutrition/matcher";
import { addDays, DEFAULT_ALLOWANCE, monthUsage } from "@/lib/social/budget";
import { dayBounds, localDateString, localHour, mealTypeForHour, zoneWithDayStart } from "@/lib/time/day";

export interface McpContext { db: SupabaseClient; userId: string }

const INSTRUCTIONS = `Life OS is the user's personal food, health, workout and habit tracker (Indian context: IFCT 2017 plus curated Indian dishes).
How to log food:
1. For each food, call search_foods first. If a result fits, log it with its food_id and a quantity — the server then uses the real database numbers. Quantity is in that food's serving (serving_desc) unless you pass unit "g" or "ml".
2. Only when nothing fits, log the item with your own kcal/protein/carbs/fat estimate (no food_id). Those are stored as "≈ estimated" — tell the user which items were estimated.
3. If the amount or variant is unclear (e.g. "some rice"), ask the user briefly instead of guessing.
4. Never invent database values. Use neutral wording about food and weight: "surplus/deficit", never "bad". The weekly average matters more than a single day.
Dates are the user's own days; a day starts at the user's configured hour, so late-night meals belong to the previous day.`;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });
const r1 = (n: number) => Math.round(n * 10) / 10;

async function profile(db: SupabaseClient, userId: string) {
  const { data } = await db.from("profiles").select("timezone, day_start_hour, calorie_target, display_name, monthly_out_budget, monthly_drink_budget").eq("id", userId).single();
  const tz = (data?.timezone as string) ?? "Asia/Kolkata";
  return { zone: zoneWithDayStart(tz, data?.day_start_hour as number | undefined), tz, target: (data?.calorie_target as number | null) ?? null, name: (data?.display_name as string | null) ?? null, outBudget: (data?.monthly_out_budget as number) ?? 4, drinkBudget: (data?.monthly_drink_budget as number) ?? 2 };
}

export function buildServer({ db, userId }: McpContext): McpServer {
  const server = new McpServer({ name: "life-os", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  /** Resolves an optional date to the user's day; rejects the future. */
  const resolveDate = async (d?: string) => {
    const p = await profile(db, userId);
    const today = localDateString(new Date(), p.zone);
    if (d && d > today) throw new Error("That date is in the future.");
    return { ...p, today, date: d ?? today };
  };
  const guard = <A>(fn: (a: A) => Promise<ReturnType<typeof text>>) => async (a: A) => {
    try { return await fn(a); } catch (e) { console.error("mcp tool failed", e); return fail(e instanceof Error ? e.message : "Something went wrong."); }
  };

  server.registerTool("search_foods", {
    title: "Search foods",
    description: "Look up foods in the user's database (IFCT 2017 + curated Indian dishes + their own). Returns per-serving nutrition and a food_id to pass to log_meal. Search in English or Hindi/Kannada/Telugu transliteration, e.g. 'masala dosa', 'ragi mudde', 'curd'.",
    inputSchema: { query: z.string().min(1).max(80), limit: z.number().int().min(1).max(15).optional() },
    annotations: { readOnlyHint: true },
  }, guard(async ({ query, limit }) => {
    const words = normalize(query).split(" ").filter(Boolean);
    const scored = (await loadCatalog(db, userId)).map((f) => {
      const hay = normalize([f.name, f.food_key.replace(/_/g, " "), f.variant ?? "", ...f.aliases].join(" "));
      const hits = words.filter((w) => hay.includes(w)).length;
      const exact = normalize(f.name) === normalize(query) || f.aliases.some((a) => normalize(a) === normalize(query)) ? 5 : 0;
      return { f, score: hits === words.length ? hits + exact + (f.source === "ifct2017" ? 0 : 1) : 0 };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit ?? 8);
    if (!scored.length) return text({ results: [], note: "No match. Ask the user or log it with your own estimate (no food_id) — it will be marked estimated." });
    return text({ results: scored.map(({ f }) => ({ food_id: f.id, name: f.name, variant: f.variant, serving: f.serving_desc, serving_unit: f.serving_unit, serving_grams: f.serving_grams, kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, source: f.source })), note: "Numbers are per one serving. For IFCT rows the serving is 100 g — pass unit 'g' with the amount in grams." });
  }));

  server.registerTool("log_meal", {
    title: "Log a meal",
    description: "Save what the user ate. Each item is either a database food (food_id from search_foods + quantity) or an estimate (name + kcal and macros, no food_id), which is stored as '≈ estimated'. Returns the day's running total.",
    inputSchema: {
      items: z.array(z.object({
        food_id: z.string().uuid().optional().describe("From search_foods. Server computes the numbers."),
        name: z.string().min(1).max(100).describe("What the user said, e.g. 'Masala dosa'"),
        quantity: z.number().positive().max(10000),
        unit: z.string().max(30).optional().describe("piece, bowl, cup, g, ml… Defaults to the food's serving unit."),
        kcal: z.number().min(0).max(3000).optional().describe("Required without food_id: total kcal for the whole quantity"),
        protein_g: z.number().min(0).max(300).optional(), carbs_g: z.number().min(0).max(500).optional(), fat_g: z.number().min(0).max(300).optional(),
      })).min(1).max(20),
      meal_type: z.enum(["breakfast", "lunch", "snack", "dinner"]).optional(),
      date: date.optional().describe("Defaults to the user's today"),
      note: z.string().max(200).optional(),
    },
  }, guard(async ({ items, meal_type, date: d, note }) => {
    const ctx = await resolveDate(d);
    const catalog = await loadCatalog(db, userId);
    const rows = [];
    for (const [i, it] of items.entries()) {
      if (it.food_id) {
        const food = catalog.find((f) => f.id === it.food_id);
        if (!food) return fail(`Unknown food_id for "${it.name}". Call search_foods again.`);
        rows.push(matchedItem(food, it.quantity, it.unit ?? food.serving_unit, i));
      } else {
        if (it.kcal == null) return fail(`"${it.name}": give kcal (and macros if you can) when there is no food_id.`);
        rows.push({ food_id: null, food_key: normalize(it.name).replace(/ /g, "_").slice(0, 80), name: it.name.charAt(0).toUpperCase() + it.name.slice(1), variant: null, quantity: it.quantity, unit: it.unit ?? "serving", kcal: Math.round(it.kcal), protein_g: it.protein_g ?? 0, carbs_g: it.carbs_g ?? 0, fat_g: it.fat_g ?? 0, match_type: "estimated" as const, clarify: null, position: i });
      }
    }
    const now = new Date();
    const mealType = meal_type ?? (ctx.date === ctx.today ? mealTypeForHour(localHour(now, ctx.zone)) : null);
    const log = await createLog(db, { userId, rawText: note ?? items.map((i) => `${i.quantity} ${i.unit ?? ""} ${i.name}`.replace(/\s+/g, " ").trim()).join(", "), mealType, items: rows });
    await setLogStatus(db, userId, log.id, "confirmed");
    if (ctx.date !== ctx.today) {
      const noon = new Date(`${ctx.date}T12:00:00Z`);
      await db.from("meal_logs").update({ logged_at: (localDateString(noon, ctx.zone) === ctx.date ? noon : dayBounds(noon, ctx.zone).start).toISOString() }).eq("id", log.id).eq("user_id", userId);
    }
    const saved = await recomputeTotal(db, log);
    const day = await mealsForDate(db, userId, ctx.zone, ctx.date);
    const eaten = Math.round(day.reduce((s, l) => s + Number(l.total_kcal), 0));
    const { target } = await targetForDay(db, userId, ctx.date, ctx.target);
    return text({ logged: { meal_id: saved.id, meal_type: mealType, date: ctx.date, total_kcal: saved.total_kcal, items: saved.items.map((x) => ({ name: x.name, quantity: x.quantity, unit: x.unit, kcal: x.kcal, protein_g: x.protein_g, estimated: x.match_type === "estimated" })) }, day_total_kcal: eaten, day_target_kcal: target, remaining_kcal: target == null ? null : target - eaten });
  }));

  server.registerTool("list_meals", {
    title: "List meals for a day",
    description: "The meals logged on a day (default today) with their ids, items and calories.",
    inputSchema: { date: date.optional() }, annotations: { readOnlyHint: true },
  }, guard(async ({ date: d }) => {
    const ctx = await resolveDate(d);
    const logs = await mealsForDate(db, userId, ctx.zone, ctx.date);
    return text({ date: ctx.date, meals: logs.map((l) => ({ meal_id: l.id, meal_type: l.meal_type, total_kcal: l.total_kcal, items: l.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, kcal: i.kcal, protein_g: i.protein_g, estimated: i.match_type === "estimated" })) })) });
  }));

  server.registerTool("delete_meal", {
    title: "Delete a meal",
    description: "Remove a logged meal by meal_id (from list_meals). Use to fix a mistake: delete, then log again.",
    inputSchema: { meal_id: z.string().uuid() }, annotations: { destructiveHint: true },
  }, guard(async ({ meal_id }) => { await deleteLog(db, userId, meal_id); return text("Deleted."); }));

  server.registerTool("get_day", {
    title: "Day summary",
    description: "Everything for one day (default today): calories eaten vs target, protein, burn and balance (only when burn data exists), habits, planned workout and what was logged.",
    inputSchema: { date: date.optional() }, annotations: { readOnlyHint: true },
  }, guard(async ({ date: d }) => {
    const ctx = await resolveDate(d);
    const [logs, [health], habits, coach, adj, sessions] = await Promise.all([
      mealsForDate(db, userId, ctx.zone, ctx.date), healthRange(db, userId, ctx.date, ctx.date), habitStatuses(db, userId, ctx.date), loadCoach(db, userId, ctx.date), targetForDay(db, userId, ctx.date, ctx.target), sessionsSince(db, userId, ctx.date),
    ]);
    const eaten = Math.round(logs.reduce((s, l) => s + Number(l.total_kcal), 0));
    const protein = Math.round(logs.reduce((s, l) => s + l.items.reduce((a, i) => a + Number(i.protein_g), 0), 0));
    const bal = logs.length ? dailyBalance({ eaten, activeKcal: health?.active_kcal ?? null, restingKcal: health?.resting_kcal ?? null }) : null;
    const plan = coach?.plan?.days.find((x) => x.weekday === isoWeekday(ctx.date));
    return text({
      date: ctx.date, eaten_kcal: eaten, target_kcal: adj.target, target_note: adj.reasons[0] ?? null, protein_g: protein, protein_target_g: coach?.result.ok ? coach.result.proteinG : null,
      balance: bal?.kind === "balance" ? { kcal: Math.round(bal.balance), label: bal.balance < 0 ? "deficit" : "surplus" } : logs.length ? "no burn data" : "nothing logged",
      health: health ? { steps: health.steps, active_kcal: health.active_kcal, resting_kcal: health.resting_kcal, sleep_hours: health.sleep_minutes == null ? null : r1(health.sleep_minutes / 60), weight_kg: health.weight_kg } : null,
      habits: habits.filter((h) => h.scheduled).map((h) => ({ habit: h.name, done: h.done, streak: h.streak })),
      planned_workout: plan?.title ?? null, workout_logged: sessions.some((s) => s.date === ctx.date),
      meals: logs.map((l) => ({ meal_id: l.id, meal_type: l.meal_type, kcal: l.total_kcal, items: l.items.map((i) => `${i.quantity} ${i.unit} ${i.name}${i.match_type === "estimated" ? " (≈ estimated)" : ""}`) })),
    });
  }));

  server.registerTool("get_week", {
    title: "Recent trend",
    description: "Per-day eaten calories, burn, balance, steps and weight for the last N days (default 7), plus the average. The weekly average is the headline number.",
    inputSchema: { days: z.number().int().min(2).max(60).optional() }, annotations: { readOnlyHint: true },
  }, guard(async ({ days }) => {
    const ctx = await resolveDate();
    const t = await trend(db, userId, ctx.zone, ctx.today, days ?? 7);
    const fed = t.filter((x) => x.hasFood);
    const avg = averageBalance(t);
    return text({ days: t.map((x) => ({ date: x.date, eaten_kcal: x.hasFood ? Math.round(x.eaten) : null, burned_kcal: x.activeKcal != null && x.restingKcal != null ? Math.round(x.activeKcal + x.restingKcal) : null, balance_kcal: x.balance == null ? null : Math.round(x.balance), steps: x.steps, weight_kg: x.weightKg })), average_eaten_kcal: fed.length ? Math.round(fed.reduce((s, x) => s + x.eaten, 0) / fed.length) : null, average_balance_kcal: avg.average == null ? null : Math.round(avg.average), logged_days: fed.length, target_kcal: ctx.target });
  }));

  server.registerTool("log_health", {
    title: "Log health numbers",
    description: "Save steps, active/resting calories, sleep hours and/or weight for a day (default today). Saving again merges and never double-counts.",
    inputSchema: { date: date.optional(), steps: z.number().int().min(0).max(200000).optional(), active_kcal: z.number().min(0).max(20000).optional(), resting_kcal: z.number().min(0).max(20000).optional(), sleep_hours: z.number().min(0).max(24).optional(), weight_kg: z.number().min(20).max(400).optional() },
  }, guard(async ({ date: d, sleep_hours, ...m }) => {
    const ctx = await resolveDate(d);
    const metrics: Record<string, unknown> = { ...m, ...(sleep_hours != null ? { sleep_minutes: Math.round(sleep_hours * 60) } : {}) };
    if (!Object.keys(metrics).length) return fail("Give at least one number.");
    const res = await saveHealthManual(db, userId, ctx.date, metrics, "mcp");
    return res.ok ? text(`Saved for ${ctx.date}.`) : fail(res.error);
  }));

  server.registerTool("log_workout", {
    title: "Log a workout",
    description: "Record a training session for a day (default today), optionally with lifts (exercise, sets, reps, weight in kg). Adds to today's session if one exists.",
    inputSchema: { title: z.string().max(60).optional(), minutes: z.number().int().min(1).max(600).optional(), note: z.string().max(300).optional(), date: date.optional(), lifts: z.array(z.object({ exercise: z.string().min(1).max(60), sets: z.number().int().min(1).max(50), reps: z.number().int().min(1).max(500), weight_kg: z.number().min(0).max(1000).nullable().optional() })).max(30).optional() },
  }, guard(async ({ title, minutes, note, date: d, lifts }) => {
    const ctx = await resolveDate(d);
    const coach = await loadCoach(db, userId, ctx.date);
    const planned = coach?.plan?.days.find((x) => x.weekday === isoWeekday(ctx.date))?.title;
    const l: LiftInput[] = (lifts ?? []).map((x) => ({ exercise: x.exercise, sets: x.sets, reps: x.reps, weight_kg: x.weight_kg ?? null }));
    await logSession(db, userId, ctx.date, title ?? planned ?? "Workout", { minutes, note, lifts: l });
    return text(`Workout saved for ${ctx.date}${l.length ? ` with ${l.length} lift${l.length === 1 ? "" : "s"}` : ""}.`);
  }));

  server.registerTool("get_coach", {
    title: "Coaching plan",
    description: "The user's calorie target, protein, pace, today's planned workout and where their weight is heading versus their goal date.",
    annotations: { readOnlyHint: true },
  }, guard(async () => {
    const ctx = await resolveDate();
    const view = await loadCoach(db, userId, ctx.today);
    if (!view) return text("No goal set yet. The user sets one on the Coach page of the Life OS website.");
    if (!view.result.ok) return text(view.result.reason);
    const r = view.result;
    const since = addDays(ctx.today, -35);
    const w = (await healthRange(db, userId, since, ctx.today)).filter((x) => x.weight_kg != null).map((x) => ({ date: x.date, kg: Number(x.weight_kg) }));
    const plan = view.plan?.days.find((x) => x.weekday === isoWeekday(ctx.today));
    return text({ current_kg: view.currentWeightKg, goal_kg: view.profile.goal_weight_kg, goal_date: view.profile.goal_date, target_kcal: r.targetKcal, protein_g: r.proteinG, carbs_g: r.carbsG, fat_g: r.fatG, steps_goal: r.stepsGoal, weekly_kg: r.weeklyKg, projection: projectGoal(w, view.profile.goal_weight_kg, view.profile.goal_date, ctx.today).message, todays_workout: plan ? { title: plan.title, exercises: plan.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`) } : "rest day" });
  }));

  server.registerTool("list_habits", {
    title: "Today's habits",
    description: "Habits scheduled for a day (default today) and whether each is done.",
    inputSchema: { date: date.optional() }, annotations: { readOnlyHint: true },
  }, guard(async ({ date: d }) => {
    const ctx = await resolveDate(d);
    return text((await habitStatuses(db, userId, ctx.date)).filter((h) => h.scheduled).map((h) => ({ habit: h.name, habit_id: h.id, done: h.done, streak: h.streak })));
  }));

  server.registerTool("set_habit", {
    title: "Tick a habit",
    description: "Mark a habit done or not done for a day (default today). Match by name (case-insensitive) or habit_id.",
    inputSchema: { habit: z.string().min(1).max(80), done: z.boolean().optional(), date: date.optional() },
  }, guard(async ({ habit, done, date: d }) => {
    const ctx = await resolveDate(d);
    const all = await habitStatuses(db, userId, ctx.date);
    const h = all.find((x) => x.id === habit) ?? all.find((x) => normalize(x.name) === normalize(habit)) ?? all.find((x) => normalize(x.name).includes(normalize(habit)));
    if (!h) return fail(`No habit matching "${habit}". Habits: ${all.map((x) => x.name).join(", ") || "none yet"}.`);
    const nowDone = await setHabitDone(db, userId, h.id, ctx.date, done);
    return text(`${h.name}: ${nowDone ? "done" : "not done"} for ${ctx.date}.`);
  }));

  server.registerTool("log_journal", {
    title: "Journal / mood",
    description: "Save today's mood (1 = rough … 5 = great) and/or a short note, optionally with #tags.",
    inputSchema: { mood: z.number().int().min(1).max(5).optional(), notes: z.string().max(2000).optional(), date: date.optional() },
  }, guard(async ({ mood, notes, date: d }) => {
    if (mood == null && !notes) return fail("Give a mood or a note.");
    const ctx = await resolveDate(d);
    await saveJournal(db, userId, ctx.date, { ...(mood != null ? { mood } : {}), ...(notes ? { notes } : {}) });
    return text(`Journal saved for ${ctx.date}.`);
  }));

  server.registerTool("plan_social_event", {
    title: "Plan a night out",
    description: "Plan eating out or drinks on a date (today or later). Life OS trims a little from the 3 days before and adds it to the day itself, so the week still balances. Counts toward the monthly plan.",
    inputSchema: { kind: z.enum(["out", "drinks"]), date: date, note: z.string().max(100).optional(), extra_kcal: z.number().int().min(0).max(3000).optional() },
  }, guard(async ({ kind, date: d, note, extra_kcal }) => {
    const ctx = await resolveDate();
    if (d < ctx.today) return fail("Pick today or a future date.");
    await addEvent(db, userId, { date: d, kind, today: ctx.today, note, allowance: extra_kcal ?? DEFAULT_ALLOWANCE[kind] });
    const month = d.slice(0, 7);
    const used = monthUsage(await listEvents(db, userId, `${month}-01`, `${month}-31`), month)[kind];
    const adj = await targetForDay(db, userId, d, ctx.target);
    return text({ saved: true, used_this_month: used, monthly_plan: kind === "out" ? ctx.outBudget : ctx.drinkBudget, target_on_that_day_kcal: adj.target });
  }));

  server.registerTool("get_social_budget", {
    title: "Eating-out & drinks plan",
    description: "How many eating-out and drinks occasions were used this month versus the monthly plan, and what's coming up.",
    annotations: { readOnlyHint: true },
  }, guard(async () => {
    const ctx = await resolveDate();
    const month = ctx.today.slice(0, 7);
    const used = monthUsage(await listEvents(db, userId, `${month}-01`, `${month}-31`), month);
    return text({ eating_out: { used: used.out, plan: ctx.outBudget }, drinks: { used: used.drinks, plan: ctx.drinkBudget }, upcoming: (await listEvents(db, userId, ctx.today, addDays(ctx.today, 30))).map((e) => ({ date: e.date, kind: e.kind })) });
  }));

  return server;
}
