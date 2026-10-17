import Link from "next/link";
import { BalanceChart, BarsChart, EatenBurnedChart, LineChart } from "@/components/charts";
import { requireSession } from "@/lib/auth/session";
import { trend } from "@/lib/db/life";
import { averageBalance } from "@/lib/health/balance";

export const metadata = { title: "Trends · Life OS" };
export const dynamic = "force-dynamic";
const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

export default async function Trends({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const n = range === "30" ? 30 : 7;
  const { db, userId, tz, today, target } = await requireSession();
  const days = await trend(db, userId, tz, today, n);
  const week = averageBalance(days.slice(-7));
  const period = averageBalance(days);

  const eatenPts = days.map((d) => ({ date: d.date, value: d.hasFood ? d.eaten : null, value2: d.activeKcal != null && d.restingKcal != null ? Math.round(d.activeKcal + d.restingKcal) : null }));
  const balancePts = days.map((d) => ({ date: d.date, value: d.balance }));
  const stepsPts = days.map((d) => ({ date: d.date, value: d.steps }));
  const sleepPts = days.map((d) => ({ date: d.date, value: d.sleepMinutes == null ? null : Math.round((d.sleepMinutes / 60) * 10) / 10 }));
  const weightPts = days.map((d) => ({ date: d.date, value: d.weightKg }));
  const noBurn = days.filter((d) => d.hasFood && (d.activeKcal == null || d.restingKcal == null)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Trends</h1>
          <p className="text-sm text-ink-soft">Watch burn estimates are approximate — read the averages, not single days.</p>
        </div>
        <div className="flex rounded-full border border-line bg-surface p-1 text-sm font-semibold" role="tablist" aria-label="Range">
          {[7, 30].map((r) => (
            <Link key={r} href={`/app/trends?range=${r}`} role="tab" aria-selected={n === r} className={`rounded-full px-4 py-1.5 ${n === r ? "bg-saffron/25 text-saffron-deep" : "text-ink-soft"}`}>{r} days</Link>
          ))}
        </div>
      </div>

      <section className="card rise grid gap-4 p-6 sm:grid-cols-3" aria-label="Averages">
        <div className="sm:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Weekly average balance</p>
          {week.average === null ? <p className="mt-2 text-ink-soft">Not enough data yet</p> : (
            <>
              <p className={`font-display text-5xl font-extrabold tabular-nums ${week.average < 0 ? "text-leaf" : "text-saffron-deep"}`}>{week.average > 0 ? "+" : ""}{fmt(week.average)}</p>
              <p className="text-sm font-semibold">kcal/day · {week.average === 0 ? "even" : week.average > 0 ? "surplus" : "deficit"}</p>
              <p className="mt-1 text-xs text-ink-soft">{week.daysCounted} of last 7 days counted</p>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <Stat label={`Avg eaten (${n}d)`} value={avgOf(days.filter((d) => d.hasFood).map((d) => d.eaten))} unit="kcal" />
          <Stat label={`Avg burned (${n}d)`} value={avgOf(days.filter((d) => d.activeKcal != null && d.restingKcal != null).map((d) => d.activeKcal! + d.restingKcal!))} unit="kcal" />
          <Stat label={`Avg steps (${n}d)`} value={avgOf(days.filter((d) => d.steps != null).map((d) => d.steps!))} unit="" />
          <Stat label={`${n}-day average balance`} value={period.average} unit="kcal" signed />
        </div>
      </section>

      {noBurn > 0 && <p className="rounded-2xl bg-bg-soft p-3 text-sm text-ink-soft">ℹ️ {noBurn} day{noBurn > 1 ? "s have" : " has"} food logged but <b>no burn data</b> — shown as gaps, never as zero.</p>}

      <ChartCard title="Eaten vs burned" sub="Bars: kcal eaten · Line: resting + active burn"><EatenBurnedChart points={eatenPts} unit="kcal" title="Calories eaten versus burned" refLine={target ? { value: target, label: `target ${fmt(target)}` } : null} /></ChartCard>
      <ChartCard title="Daily balance" sub="Eaten minus burned. Above zero = surplus, below = deficit."><BalanceChart points={balancePts} unit="kcal" title="Daily calorie balance" refLine={week.average === null ? null : { value: week.average, label: `7-day avg ${week.average > 0 ? "+" : ""}${fmt(week.average)}` }} /></ChartCard>
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Steps"><BarsChart points={stepsPts} unit="steps" title="Daily steps" color="var(--leaf)" seriesNames={["Steps"]} /></ChartCard>
        <ChartCard title="Sleep"><BarsChart points={sleepPts} unit="h" title="Sleep hours" color="var(--maroon)" decimals={1} seriesNames={["Sleep"]} /></ChartCard>
      </div>
      <ChartCard title="Weight"><LineChart points={weightPts} unit="kg" title="Weight" decimals={1} seriesNames={["Weight"]} color="var(--saffron-deep)" /></ChartCard>
    </div>
  );
}

function avgOf(xs: number[]) { return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null; }

function Stat({ label, value, unit, signed }: { label: string; value: number | null; unit: string; signed?: boolean }) {
  return (
    <div className="rounded-2xl bg-bg-soft p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="font-display text-xl font-bold tabular-nums">{value == null ? "—" : `${signed && value > 0 ? "+" : ""}${fmt(value)}`} <span className="text-xs font-semibold text-ink-soft">{value == null ? "" : unit}</span></p>
    </div>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card rise p-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {sub && <p className="mb-2 text-xs text-ink-soft">{sub}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}
