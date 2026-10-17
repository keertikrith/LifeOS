import Link from "next/link";
import { BalanceChart, BarsChart, EatenBurnedChart, LineChart } from "@/components/charts";
import { HBars, Heatmap, Stat } from "@/components/insight-bits";
import { requireSession } from "@/lib/auth/session";
import { byMealType, byWeekday, dailyTotals, heatLevels, macroShare, movingAverage, topFoods, weeklySummaries } from "@/lib/analytics/stats";
import { loadCoach } from "@/lib/coach/load";
import { habitCompletion, foodRows, moodSeries } from "@/lib/db/insights";
import { trend } from "@/lib/db/life";
import { averageBalance, lastNDates } from "@/lib/health/balance";

export const metadata = { title: "Insights · Life OS" };
export const dynamic = "force-dynamic";
const fmt = (n: number | null, d = 0) => (n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d }));
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20 p-5 sm:p-6" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="font-display text-lg font-semibold">{title}</h2>
      {sub && <p className="mb-3 text-xs text-ink-soft">{sub}</p>}
      <div className={sub ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export default async function Insights({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const n = range === "90" ? 90 : range === "30" ? 30 : 7;
  const { db, userId, tz, today, target } = await requireSession();
  const dates = lastNDates(today, n);

  const [days, food, habits, moods, coach] = await Promise.all([
    trend(db, userId, tz, today, n), foodRows(db, userId, tz, dates), habitCompletion(db, userId, tz, dates), moodSeries(db, userId, dates), loadCoach(db, userId, today),
  ]);

  const totals = dailyTotals(food);
  const loggedDays = days.filter((d) => d.hasFood).length;
  const burnedDays = days.filter((d) => d.activeKcal != null && d.restingKcal != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgEaten = avg(days.filter((d) => d.hasFood).map((d) => d.eaten));
  const avgBurned = avg(burnedDays.map((d) => d.activeKcal! + d.restingKcal!));
  const avgBalance = averageBalance(days).average;
  const avgProtein = avg([...totals.values()].map((t) => t.protein));
  const avgSteps = avg(days.filter((d) => d.steps != null).map((d) => d.steps!));
  const macros = macroShare(food);
  const proteinTarget = coach?.result.ok ? coach.result.proteinG : null;
  const goalKg = coach?.profile.goal_weight_kg ?? null;

  const eatenPts = days.map((d) => ({ date: d.date, value: d.hasFood ? d.eaten : null, value2: d.activeKcal != null && d.restingKcal != null ? Math.round(d.activeKcal + d.restingKcal) : null }));
  const balancePts = days.map((d) => ({ date: d.date, value: d.balance }));
  const weights = days.map((d) => d.weightKg);
  const ma = movingAverage(weights, 7);
  const weightPts = days.map((d, i) => ({ date: d.date, value: d.weightKg, value2: ma[i] }));
  const proteinPts = days.map((d) => ({ date: d.date, value: totals.get(d.date) ? Math.round(totals.get(d.date)!.protein) : null }));
  const heat = heatLevels(days.map((d) => ({ date: d.date, kcal: d.eaten, hasFood: d.hasFood }))).map((h, i) => ({ ...h, kcal: days[i].eaten }));
  const weekly = weeklySummaries(days.map((d) => ({ date: d.date, eaten: d.eaten, hasFood: d.hasFood, burned: d.activeKcal != null && d.restingKcal != null ? d.activeKcal + d.restingKcal : null, steps: d.steps, sleepMinutes: d.sleepMinutes, weightKg: d.weightKg })));
  const wdays = byWeekday(food);
  const moodPts = dates.map((date) => ({ date, value: moods.find((m) => m.date === date)?.mood ?? null }));
  const noBurn = days.filter((d) => d.hasFood && (d.activeKcal == null || d.restingKcal == null)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Insights</h1>
          <p className="text-sm text-ink-soft">Read the averages, not single days — watch burn estimates are approximate.</p>
        </div>
        <div className="flex border border-line text-sm font-semibold" role="tablist" aria-label="Range">
          {[7, 30, 90].map((r) => <Link key={r} href={`/app/trends?range=${r}`} role="tab" aria-selected={n === r} className={`px-4 py-1.5 ${n === r ? "bg-ink text-bg" : "text-ink-soft"}`}>{r}d</Link>)}
        </div>
      </div>

      <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-ink-soft" aria-label="Sections">
        {[["calories", "Calories"], ["nutrition", "Nutrition"], ["body", "Body"], ["consistency", "Consistency"], ["habits", "Habits & mood"]].map(([id, l]) => <a key={id} href={`#${id}`} className="underline-offset-4 hover:text-ink hover:underline">{l}</a>)}
      </nav>

      <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-6" aria-label="Summary">
        <Stat label="Avg eaten" value={fmt(avgEaten)} sub="kcal / logged day" />
        <Stat label="Avg burned" value={fmt(avgBurned)} sub="kcal / day" />
        <Stat label="Avg balance" value={avgBalance == null ? "—" : `${avgBalance > 0 ? "+" : ""}${fmt(avgBalance)}`} sub={avgBalance == null ? "needs food + burn" : avgBalance > 0 ? "surplus / day" : "deficit / day"} />
        <Stat label="Avg protein" value={avgProtein == null ? "—" : `${fmt(avgProtein)} g`} sub={proteinTarget ? `target ${proteinTarget} g` : "per logged day"} />
        <Stat label="Avg steps" value={fmt(avgSteps)} />
        <Stat label="Days logged" value={`${loggedDays}/${n}`} />
      </div>
      {noBurn > 0 && <p className="border border-line bg-bg-soft p-3 text-sm text-ink-soft">{noBurn} day{noBurn > 1 ? "s have" : " has"} food logged but <b className="text-ink">no burn data</b> — shown as gaps, never as zero.</p>}

      <Section id="calories" title="Calories in vs out" sub="Bars: eaten. Line: resting + active burn.">
        <EatenBurnedChart points={eatenPts} unit="kcal" title="Calories eaten versus burned" refLine={target ? { value: target, label: `target ${fmt(target)}` } : null} />
        <h3 className="mb-1 mt-6 text-sm font-semibold">Daily balance <span className="font-normal text-ink-soft">— above zero is surplus, below is deficit</span></h3>
        <BalanceChart points={balancePts} unit="kcal" title="Daily calorie balance" refLine={avgBalance == null ? null : { value: avgBalance, label: `avg ${avgBalance > 0 ? "+" : ""}${fmt(avgBalance)}` }} />
      </Section>

      <Section id="nutrition" title="Nutrition" sub="From your confirmed meals. “≈” marks foods priced by an AI estimate rather than the database.">
        {macros ? (
          <>
            <h3 className="mb-2 text-sm font-semibold">Where your calories come from</h3>
            <div className="flex h-4 w-full overflow-hidden border border-line" role="img" aria-label={`Protein ${macros.proteinPct}%, carbs ${macros.carbsPct}%, fat ${macros.fatPct}%`}>
              <span className="bg-ink" style={{ width: `${macros.proteinPct}%` }} /><span className="bg-ink-soft" style={{ width: `${macros.carbsPct}%` }} /><span className="bg-line" style={{ width: `${macros.fatPct}%` }} />
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <li><span className="mr-2 inline-block h-2 w-2 bg-ink align-middle" />Protein <b>{macros.proteinPct}%</b> · {macros.avgProtein} g/day</li>
              <li><span className="mr-2 inline-block h-2 w-2 bg-ink-soft align-middle" />Carbs <b>{macros.carbsPct}%</b> · {macros.avgCarbs} g/day</li>
              <li><span className="mr-2 inline-block h-2 w-2 bg-line align-middle" />Fat <b>{macros.fatPct}%</b> · {macros.avgFat} g/day</li>
            </ul>
          </>
        ) : <p className="text-sm text-ink-soft">Log a few meals to see your macro split.</p>}

        <h3 className="mb-1 mt-6 text-sm font-semibold">Protein per day</h3>
        <BarsChart points={proteinPts} unit="g" title="Protein per day" seriesNames={["Protein"]} color="var(--ink)" refLine={proteinTarget ? { value: proteinTarget, label: `target ${proteinTarget} g` } : null} />

        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div><h3 className="mb-3 text-sm font-semibold">Avg calories by meal</h3><HBars rows={byMealType(food).map((m) => ({ label: m.type[0].toUpperCase() + m.type.slice(1), value: m.avgKcal }))} unit=" kcal" empty="Log meals to see this." /></div>
          <div><h3 className="mb-3 text-sm font-semibold">Avg calories by weekday</h3><HBars rows={wdays.map((w) => ({ label: WD[w.weekday - 1], value: w.avgKcal }))} unit=" kcal" empty="Needs a week or more of logs." /></div>
        </div>

        <h3 className="mb-3 mt-6 text-sm font-semibold">What you eat most (by calories)</h3>
        <HBars rows={topFoods(food, 8).map((f) => ({ label: `${f.estimated ? "≈ " : ""}${f.name}`, value: f.kcal, note: `${f.days}d` }))} unit=" kcal" empty="Log meals to see your most-eaten foods." />
      </Section>

      <Section id="body" title="Body" sub="Solid line: daily weigh-ins. Dashed: 7-day average — judge by this, not single days.">
        <LineChart points={weightPts} unit="kg" title="Weight with 7-day average" decimals={1} seriesNames={["Weight", "7-day avg"]} color="var(--ink-soft)" refLine={goalKg ? { value: goalKg, label: `goal ${goalKg} kg` } : null} />
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div><h3 className="mb-1 text-sm font-semibold">Steps</h3><BarsChart points={days.map((d) => ({ date: d.date, value: d.steps }))} unit="steps" title="Daily steps" compact seriesNames={["Steps"]} color="var(--ink)" refLine={coach?.result.ok ? { value: coach.result.stepsGoal, label: `goal ${fmt(coach.result.stepsGoal)}` } : null} /></div>
          <div><h3 className="mb-1 text-sm font-semibold">Sleep</h3><BarsChart points={days.map((d) => ({ date: d.date, value: d.sleepMinutes == null ? null : Math.round((d.sleepMinutes / 60) * 10) / 10 }))} unit="h" title="Sleep hours" compact decimals={1} seriesNames={["Sleep"]} color="var(--ink-soft)" /></div>
        </div>
      </Section>

      <Section id="weekly" title="Week by week" sub="Calendar weeks (Mon–Sun). Balance counts days with both food and burn data.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm tabular-nums">
            <thead className="text-xs uppercase tracking-wide text-ink-soft"><tr><th className="py-2 pr-3">Week of</th><th>Logged</th><th>Eaten</th><th>Burned</th><th>Balance</th><th>Steps</th><th>Sleep</th><th>Weight</th></tr></thead>
            <tbody>{[...weekly].reverse().map((w) => (
              <tr key={w.weekStart} className="border-t border-line">
                <td className="py-2 pr-3 font-semibold">{short(w.weekStart)}</td><td>{w.loggedDays}/7</td><td>{fmt(w.avgEaten)}</td><td>{fmt(w.avgBurned)}</td>
                <td>{w.avgBalance == null ? "—" : `${w.avgBalance > 0 ? "+" : ""}${fmt(w.avgBalance)}`}</td><td>{fmt(w.avgSteps)}</td><td>{w.avgSleepH == null ? "—" : `${w.avgSleepH} h`}</td><td>{w.weightKg == null ? "—" : `${w.weightKg} kg`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section id="consistency" title="Logging consistency" sub={`${loggedDays} of the last ${n} days have food logged. Darker means more calories logged.`}>
        <Heatmap days={heat} />
      </Section>

      <Section id="habits" title="Habits & mood">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Habit completion</h3>
            <HBars rows={habits.map((h) => ({ label: h.name, value: h.pct, note: h.scheduled ? `${h.done}/${h.scheduled}` : "" }))} unit="%" empty="Add habits to see completion rates." />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Mood <span className="font-normal text-ink-soft">(1 low – 5 great)</span></h3>
            <BarsChart points={moodPts} unit="" title="Daily mood" compact seriesNames={["Mood"]} color="var(--ink)" />
          </div>
        </div>
      </Section>
    </div>
  );
}
