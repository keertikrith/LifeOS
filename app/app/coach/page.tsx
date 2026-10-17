import { CoachForm } from "@/components/coach-form";
import { requireSession } from "@/lib/auth/session";
import { loadCoach } from "@/lib/coach/load";
import { WEEKDAY_NAMES } from "@/lib/coach/workouts";
import { isoWeekday } from "@/lib/habits/schedule";

export const metadata = { title: "Coach · Life OS" };
export const dynamic = "force-dynamic";
const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const prettyDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function CoachPage() {
  const { db, userId, today } = await requireSession();
  const view = await loadCoach(db, userId, today);
  const age = view ? Number(today.slice(0, 4)) - view.profile.birth_year : null;
  const r = view?.result;
  const todayDow = isoWeekday(today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Coach</h1>
        <p className="text-sm text-ink-soft">Tell me your goal. I&apos;ll work out your daily calories, protein and a weekly workout plan.</p>
      </div>

      {!view && (
        <section className="card p-6" aria-labelledby="start-h">
          <h2 id="start-h" className="mb-4 font-display text-lg font-semibold">Set your goal</h2>
          <CoachForm profile={null} age={null} currentWeight={null} />
        </section>
      )}

      {view && r && !r.ok && (
        <section className="card p-6"><h2 className="mb-2 font-display text-lg font-semibold">We need to adjust your goal</h2><p className="text-sm">{r.reason}</p></section>
      )}

      {view && r?.ok && (
        <>
          <section className="card p-6" aria-labelledby="plan-h">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Your daily target</p>
            <h2 id="plan-h" className="sr-only">Calorie plan</h2>
            <p className="mt-1 font-display text-6xl font-semibold tabular-nums">{fmt(r.targetKcal)}<span className="ml-2 text-lg font-medium text-ink-soft">kcal / day</span></p>
            <p className="mt-2 text-sm text-ink-soft">
              {r.direction === "maintain" ? "Maintenance — hold your weight." : r.direction === "lose" ? `${fmt(-r.dailyDeltaKcal)} kcal below your maintenance of ${fmt(r.maintenance)}.` : `${fmt(r.dailyDeltaKcal)} kcal above your maintenance of ${fmt(r.maintenance)}.`}
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-px border border-line bg-line text-center sm:grid-cols-4">
              {[
                ["Now → goal", `${view.currentWeightKg} → ${view.profile.goal_weight_kg} kg`],
                ["Pace", r.direction === "maintain" ? "steady" : `${Math.abs(r.weeklyKg)} kg / week`],
                ["Estimated date", r.etaDate ? prettyDate(r.etaDate) : "—"],
                ["Steps / day", fmt(r.stepsGoal)],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface p-4"><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{k}</dt><dd className="mt-1 font-semibold tabular-nums">{v}</dd></div>
              ))}
            </dl>

            <h3 className="mb-2 mt-6 text-sm font-semibold">Daily macros</h3>
            <div className="flex h-3 w-full overflow-hidden" role="img" aria-label={`Protein ${r.proteinG} g, carbs ${r.carbsG} g, fat ${r.fatG} g`}>
              <span className="bg-ink" style={{ flex: r.proteinG * 4 }} /><span className="bg-ink-soft" style={{ flex: r.carbsG * 4 }} /><span className="bg-line" style={{ flex: r.fatG * 9 }} />
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <li><span className="mr-2 inline-block h-2 w-2 bg-ink align-middle" />Protein <b>{r.proteinG} g</b></li>
              <li><span className="mr-2 inline-block h-2 w-2 bg-ink-soft align-middle" />Carbs <b>{r.carbsG} g</b></li>
              <li><span className="mr-2 inline-block h-2 w-2 bg-line align-middle" />Fat <b>{r.fatG} g</b></li>
            </ul>
            <p className="mt-3 text-xs text-ink-soft">Good Indian protein sources: dal, paneer, curd, eggs, chicken, fish, soya chunks, sprouts, chana. Your log in Telegram tracks this against your target.</p>

            {r.notes.length > 0 && <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm text-ink-soft">{r.notes.map((n) => <li key={n}>— {n}</li>)}</ul>}
          </section>

          {view.progress && (
            <section className="card p-6" aria-labelledby="prog-h">
              <h2 id="prog-h" className="mb-1 font-display text-lg font-semibold">Progress vs plan</h2>
              <p className="text-sm"><b>{view.progress.actualWeeklyKg > 0 ? "+" : ""}{view.progress.actualWeeklyKg} kg/week</b> actual · plan {r.weeklyKg > 0 ? "+" : ""}{r.weeklyKg} kg/week</p>
              <p className="mt-1 text-sm text-ink-soft">{view.progress.message}</p>
            </section>
          )}

          {view.plan && (
            <section className="card p-6" aria-labelledby="wk-h">
              <h2 id="wk-h" className="font-display text-lg font-semibold">Weekly workout plan</h2>
              <p className="mb-4 text-sm text-ink-soft">{view.plan.split} · {view.profile.equipment === "home" ? "at home, no equipment" : "gym"} · {view.profile.experience}</p>
              <div className="divide-y divide-line border border-line">
                {WEEKDAY_NAMES.map((name, i) => {
                  const day = view.plan!.days.find((d) => d.weekday === i + 1);
                  const isToday = i + 1 === todayDow;
                  return (
                    <details key={name} open={isToday && !!day} className={isToday ? "bg-bg-soft" : ""}>
                      <summary className="flex cursor-pointer items-baseline justify-between gap-3 px-4 py-3 text-sm">
                        <span className="font-semibold">{name}{isToday && <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">today</span>}</span>
                        <span className={day ? "" : "text-ink-soft"}>{day ? `${day.title} — ${day.focus}` : "Rest / easy walk"}</span>
                      </summary>
                      {day && (
                        <table className="w-full text-left text-sm"><tbody>{day.exercises.map((e) => (
                          <tr key={e.name} className="border-t border-line"><td className="px-4 py-2">{e.name}</td><td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-ink-soft">{e.sets} × {e.reps}</td></tr>
                        ))}</tbody></table>
                      )}
                    </details>
                  );
                })}
              </div>
              <h3 className="mb-1 mt-5 text-sm font-semibold">Cardio and steps</h3>
              <ul className="space-y-1 text-sm text-ink-soft">{view.plan.cardio.map((c) => <li key={c}>— {c}</li>)}</ul>
              <h3 className="mb-1 mt-4 text-sm font-semibold">How to train</h3>
              <ul className="space-y-1 text-sm text-ink-soft">{view.plan.tips.map((t) => <li key={t}>— {t}</li>)}</ul>
            </section>
          )}
        </>
      )}

      {view && (
        <details className="card p-6">
          <summary className="cursor-pointer font-display text-lg font-semibold">Change my goal</summary>
          <div className="mt-4"><CoachForm profile={view.profile} age={age} currentWeight={view.currentWeightKg} /></div>
        </details>
      )}

      <p className="text-xs leading-relaxed text-ink-soft">This is general guidance based on standard formulas, not medical advice. If you have a health condition, are pregnant or breastfeeding, take medication, or have an eating-disorder history, please talk to a doctor or registered dietitian before changing your diet or exercise.</p>
    </div>
  );
}
