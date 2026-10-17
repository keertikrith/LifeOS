import { DeleteMeal, ItemEditor } from "@/components/meal-controls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HabitRow } from "@/components/habit-row";
import { requireSession, isDateString } from "@/lib/auth/session";
import { getJournal, habitStatuses, healthRange, mealsForDate } from "@/lib/db/life";
import { dailyBalance, describeBalance } from "@/lib/health/balance";
import { moodEmoji } from "@/lib/journal/mood";

export const dynamic = "force-dynamic";
const fmt = (n: number | null, d = 0) => (n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d }));
const shift = (iso: string, days: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };
const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const MEAL_LABEL = { breakfast: " Breakfast", lunch: " Lunch", snack: " Snack", dinner: " Dinner" } as const;

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  return { title: `${(await params).date} · Life OS` };
}

export default async function DayView({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isDateString(date)) notFound();
  const { db, userId, tz, today } = await requireSession();
  if (date > today) notFound();

  const [meals, [health], habits, journal] = await Promise.all([
    mealsForDate(db, userId, tz, date),
    healthRange(db, userId, date, date),
    habitStatuses(db, userId, date),
    getJournal(db, userId, date),
  ]);
  const eaten = Math.round(meals.reduce((s, l) => s + Number(l.total_kcal), 0));
  const bal = meals.length > 0 ? dailyBalance({ eaten, activeKcal: health?.active_kcal ?? null, restingKcal: health?.resting_kcal ?? null }) : ({ kind: "no_burn_data", eaten } as const);
  const due = habits.filter((h) => h.scheduled);
  const next = shift(date, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/app/day/${shift(date, -1)}`} className="btn-ghost !px-4 !py-2 text-sm" aria-label="Previous day">←</Link>
        <div className="text-center">
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{date === today ? "Today" : pretty(date)}</h1>
          {date === today && <p className="text-sm text-ink-soft">{pretty(date)}</p>}
        </div>
        {next <= today ? <Link href={`/app/day/${next}`} className="btn-ghost !px-4 !py-2 text-sm" aria-label="Next day">→</Link> : <span className="w-[54px]" />}
      </div>

      <section className="card rise grid grid-cols-3 gap-2 p-5 text-center" aria-label="Summary">
        <div className=" bg-bg-soft p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Eaten</p><p className="font-display text-2xl font-bold tabular-nums">{fmt(eaten)}</p></div>
        <div className=" bg-bg-soft p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Burned</p><p className="font-display text-2xl font-bold tabular-nums">{bal.kind === "balance" ? fmt(bal.burned) : "—"}</p></div>
        <div className=" bg-bg-soft p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Balance</p><p className="font-display text-2xl font-bold tabular-nums">{bal.kind === "balance" ? `${bal.balance > 0 ? "+" : ""}${fmt(bal.balance)}` : "—"}</p></div>
        <p className="col-span-3 text-sm text-ink-soft">{bal.kind === "balance" ? describeBalance(bal.balance) : meals.length === 0 ? "Nothing logged this day, so no balance" : "No burn data for this day"}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card rise p-6" aria-labelledby="food-h">
          <h2 id="food-h" className="mb-3 font-display text-lg font-bold">Food</h2>
          {meals.length === 0 ? <p className="text-sm text-ink-soft">Nothing logged.</p> : (
            <ul className="space-y-4">{meals.map((l) => (
              <li key={l.id}>
                <p className="mb-1 flex justify-between text-sm font-semibold"><span>{l.meal_type ? MEAL_LABEL[l.meal_type] : " Meal"}</span><span>{fmt(l.total_kcal)} kcal</span></p>
                <ul className="space-y-1.5 text-sm text-ink-soft">{l.items.map((i) => { const q = Number.isInteger(i.quantity) ? i.quantity : Math.round(i.quantity * 100) / 100; return <li key={i.id}><ItemEditor id={i.id} quantity={q} label={`${q} ${i.unit} ${i.name}${i.match_type === "estimated" ? " ≈ estimated" : ""}`} /></li>; })}</ul>
                <p className="mt-2"><DeleteMeal id={l.id} /></p>
              </li>
            ))}</ul>
          )}
        </section>

        <section className="card rise p-6" aria-labelledby="health-h">
          <h2 id="health-h" className="mb-3 font-display text-lg font-bold">Health</h2>
          {!health ? <p className="text-sm text-ink-soft">No Apple Health data for this day.</p> : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[["Steps", fmt(health.steps)], ["Sleep", health.sleep_minutes == null ? "—" : `${fmt(health.sleep_minutes / 60, 1)} h`], ["Active", health.active_kcal == null ? "—" : `${fmt(health.active_kcal)} kcal`], ["Resting", health.resting_kcal == null ? "—" : `${fmt(health.resting_kcal)} kcal`], ["Weight", health.weight_kg == null ? "—" : `${fmt(health.weight_kg, 1)} kg`]].map(([k, v]) => (
                <div key={k} className=" bg-bg-soft p-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
              ))}
              {health.workouts?.map((w, i) => <div key={i} className="col-span-2  bg-bg-soft p-3"> {w.type}{w.minutes ? ` · ${w.minutes} min` : ""}{w.kcal ? ` · ${w.kcal} kcal` : ""}</div>)}
            </dl>
          )}
        </section>

        <section className="card rise p-6" aria-labelledby="hab-h">
          <h2 id="hab-h" className="mb-3 font-display text-lg font-bold">Habits {due.length > 0 && <span className="text-sm font-semibold text-ink-soft">· {due.filter((h) => h.done).length}/{due.length}</span>}</h2>
          {due.length === 0 ? <p className="text-sm text-ink-soft">No habits scheduled.</p> : <ul className="space-y-2">{due.map((h) => <HabitRow key={h.id} h={h} date={date} compact />)}</ul>}
        </section>

        <section className="card rise p-6" aria-labelledby="jr-h">
          <div className="mb-3 flex items-center justify-between"><h2 id="jr-h" className="font-display text-lg font-bold">Journal</h2><Link href={`/app/journal?date=${date}`} className="text-xs font-semibold text-saffron-deep underline">{journal ? "Edit" : "Write"}</Link></div>
          {!journal ? <p className="text-sm text-ink-soft">No entry for this day.</p> : (
            <>
              <p className="text-3xl" aria-label="Mood">{moodEmoji(journal.mood)}</p>
              {journal.notes && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{journal.notes}</p>}
              {journal.tags.length > 0 && <p className="mt-2 flex flex-wrap gap-1.5">{journal.tags.map((t) => <span key={t} className=" bg-bg-soft px-2.5 py-0.5 text-xs font-semibold text-saffron-deep">#{t}</span>)}</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
