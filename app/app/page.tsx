import Link from "next/link";
import { CalorieRing } from "@/components/calorie-ring";
import { HabitRow } from "@/components/habit-row";
import { MoodQuick } from "@/components/mood-picker";
import { requireSession } from "@/lib/auth/session";
import { adminClient } from "@/lib/db/clients";
import { getJournal, habitStatuses, mealsForDate, trend } from "@/lib/db/life";
import { autoConfirmStale } from "@/lib/db/meals";
import { loggingStreak } from "@/lib/db/stats";
import { env } from "@/lib/env";
import { greetingFor, nudgeFor } from "@/lib/greeting";
import { averageBalance, dailyBalance, describeBalance } from "@/lib/health/balance";
import { localHour } from "@/lib/time/day";

export const metadata = { title: "Today · Life OS" };
export const dynamic = "force-dynamic";

const MEAL_LABEL = { breakfast: "🌅 Breakfast", lunch: "🍛 Lunch", snack: "🫖 Snack", dinner: "🌙 Dinner" } as const;
const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

export default async function Dashboard() {
  const { db, userId, tz, now, today, displayName, target } = await requireSession();
  await autoConfirmStale(adminClient(), userId, env.autoConfirmMinutes()); // honour auto-confirm for logs never tapped in Telegram

  const [logs, week, streak, habits, journal] = await Promise.all([
    mealsForDate(db, userId, tz, today),
    trend(db, userId, tz, today, 7),
    loggingStreak(db, userId, tz, now),
    habitStatuses(db, userId, today),
    getJournal(db, userId, today),
  ]);

  const eaten = Math.round(logs.reduce((s, l) => s + Number(l.total_kcal), 0));
  const todayRow = week[week.length - 1];
  // no meals logged = an untracked day, not a zero-calorie day: don't compute a balance from it
  const hasFood = logs.length > 0;
  const bal = hasFood ? dailyBalance({ eaten, activeKcal: todayRow.activeKcal, restingKcal: todayRow.restingKcal }) : ({ kind: "no_burn_data", eaten } as const);
  const avg = averageBalance(week);
  const diff = target ? target - eaten : null;
  const seed = Number(today.replaceAll("-", ""));
  const hello = greetingFor(localHour(now, tz), seed);
  const firstName = (displayName ?? "").split(" ")[0];
  const due = habits.filter((h) => h.scheduled);

  return (
    <>
      <section className="rise mb-6">
        <p className="text-sm font-semibold text-saffron-deep">{hello.native} · {hello.say}</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{firstName ? `${firstName},` : "Hello,"} here&apos;s your day</h1>
        <p className="mt-1 text-ink-soft">{nudgeFor(seed)}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-5">
        <section className="card rise p-6 md:col-span-3" aria-labelledby="today-h">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="today-h" className="font-display text-lg font-bold">Today</h2>
            {streak > 0 && <span className="rounded-full bg-bg-soft px-3 py-1 text-sm font-bold text-saffron-deep"><span className="flame" aria-hidden>🔥</span> {streak}-day logging streak</span>}
          </div>
          <CalorieRing eaten={eaten} target={target} />
          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-bg-soft p-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Eaten</dt><dd className="font-display text-xl font-bold tabular-nums">{fmt(eaten)}</dd></div>
            <div className="rounded-2xl bg-bg-soft p-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Burned</dt><dd className="font-display text-xl font-bold tabular-nums">{bal.kind === "balance" ? fmt(bal.burned) : "—"}</dd></div>
            <div className="rounded-2xl bg-bg-soft p-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Balance</dt><dd className={`font-display text-xl font-bold tabular-nums ${bal.kind === "balance" ? (bal.label === "deficit" ? "text-leaf" : "text-saffron-deep") : "text-ink-soft"}`}>{bal.kind === "balance" ? `${bal.balance > 0 ? "+" : ""}${fmt(bal.balance)}` : "—"}</dd></div>
          </dl>
          <p className="mt-3 text-center text-sm text-ink-soft">
            {bal.kind === "balance" ? <>Today so far: <b>{describeBalance(bal.balance)}</b></> : hasFood ? <><b>No burn data</b> for today yet — it arrives when your Apple Health sync runs.</> : <>Log a meal to see today&apos;s balance.</>}
            {diff !== null && <><br />Target {fmt(target!)} · {diff >= 0 ? <b className="text-leaf">{fmt(diff)} kcal remaining</b> : <b className="text-maroon">{fmt(-diff)} kcal above</b>}</>}
          </p>
        </section>

        <section className="card rise flex flex-col justify-between p-6 md:col-span-2" aria-labelledby="wk-h" style={{ animationDelay: "0.08s" }}>
          <div>
            <h2 id="wk-h" className="font-display text-lg font-bold">Weekly average</h2>
            <p className="mt-1 text-xs text-ink-soft">The headline number — single days are noisy.</p>
            {avg.average === null ? (
              <p className="mt-5 text-ink-soft">{week.some((d) => d.activeKcal != null) ? "Log meals on days with Apple Health data to see your average." : <>Connect Apple Health to see your balance. <Link href="/app/health" className="font-semibold text-saffron-deep underline">Set it up →</Link></>}</p>
            ) : (
              <>
                <p className={`mt-4 font-display text-5xl font-extrabold tabular-nums ${avg.average < 0 ? "text-leaf" : "text-saffron-deep"}`}>{avg.average > 0 ? "+" : ""}{fmt(avg.average)}</p>
                <p className="text-sm font-semibold">kcal/day · {avg.average === 0 ? "even" : avg.average > 0 ? "surplus" : "deficit"}</p>
                <p className="mt-2 text-xs text-ink-soft">Based on {avg.daysCounted} of the last 7 days (days with both food logs and burn data).</p>
              </>
            )}
          </div>
          <Link href="/app/trends" className="btn-ghost mt-5 !py-2 text-sm">See trends →</Link>
        </section>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card rise p-6" aria-labelledby="habits-h" style={{ animationDelay: "0.1s" }}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="habits-h" className="font-display text-lg font-bold">Habits</h2>
            {due.length > 0 && <span className="text-sm font-semibold text-ink-soft">{due.filter((h) => h.done).length}/{due.length} done</span>}
          </div>
          {habits.length === 0 ? (
            <p className="text-sm text-ink-soft">No habits yet. <Link href="/app/habits" className="font-semibold text-saffron-deep underline">Add your first →</Link></p>
          ) : (
            <ul className="space-y-2">{due.map((h) => <HabitRow key={h.id} h={h} date={today} compact />)}{due.length === 0 && <li className="text-sm text-ink-soft">Nothing scheduled today — enjoy the rest day 🌿</li>}</ul>
          )}
        </section>

        <section className="card rise p-6" aria-labelledby="mood-h" style={{ animationDelay: "0.12s" }}>
          <h2 id="mood-h" className="mb-1 font-display text-lg font-bold">How was your day?</h2>
          <p className="mb-3 text-sm text-ink-soft">{journal?.notes ? <>“{journal.notes.slice(0, 90)}{journal.notes.length > 90 ? "…" : ""}”</> : "One tap is enough. Add a note any time."}</p>
          <MoodQuick date={today} current={journal?.mood ?? null} />
          <Link href="/app/journal" className="mt-4 inline-block text-sm font-semibold text-saffron-deep underline">Open journal →</Link>
        </section>
      </div>

      <section className="card rise mt-4 p-6" aria-labelledby="meals-h" style={{ animationDelay: "0.14s" }}>
        <h2 id="meals-h" className="mb-4 font-display text-lg font-bold">Meals today</h2>
        {logs.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-4xl" aria-hidden>🍽️</p>
            <p className="mt-2 font-semibold">Nothing logged yet</p>
            <p className="text-sm text-ink-soft">Message the bot something like “2 idli and filter coffee”. <Link href="/app/settings" className="font-semibold text-saffron-deep underline">Link Telegram</Link></p>
          </div>
        ) : (
          <ul className="space-y-5">
            {logs.map((l) => (
              <li key={l.id}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <h3 className="font-semibold">{l.meal_type ? MEAL_LABEL[l.meal_type] : "🍽 Meal"}</h3>
                  <span className="text-sm font-bold tabular-nums text-saffron-deep">{fmt(l.total_kcal)} kcal</span>
                </div>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-warm">
                  {l.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span>
                        {Number.isInteger(i.quantity) ? i.quantity : Math.round(i.quantity * 100) / 100} {i.unit} · {i.name}
                        {i.match_type === "estimated" && <span className="ml-2 rounded-full bg-chili-soft px-2 py-0.5 text-[11px] font-semibold text-chili">≈ estimated</span>}
                      </span>
                      <span className="tabular-nums text-ink-soft">{fmt(i.kcal)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
