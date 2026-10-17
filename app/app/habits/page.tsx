import { HabitRow } from "@/components/habit-row";
import { requireSession } from "@/lib/auth/session";
import { habitStatuses } from "@/lib/db/life";
import { WEEKDAY_LABELS } from "@/lib/habits/schedule";
import { addHabit, archiveHabitAction } from "../actions";

export const metadata = { title: "Habits · Life OS" };
export const dynamic = "force-dynamic";
const SUGGESTIONS = ["🧘 Yoga", "💧 8 glasses of water", "🚶 Evening walk", "📖 Read 20 min", "🙏 Pooja / meditation", "😴 In bed by 11"];

export default async function Habits() {
  const { db, userId, today } = await requireSession();
  const habits = await habitStatuses(db, userId, today);
  const due = habits.filter((h) => h.scheduled);
  const doneCount = due.filter((h) => h.done).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Habits</h1>
        <p className="text-sm text-ink-soft">Small things, done on the days you chose. You can also tick them off in Telegram with /habits.</p>
      </div>

      <section className="card rise p-6" aria-labelledby="today-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="today-h" className="font-display text-lg font-bold">Today</h2>
          {due.length > 0 && <span className="text-sm font-semibold text-ink-soft">{doneCount}/{due.length} done</span>}
        </div>
        {due.length > 0 && <div className="mb-4 h-2 overflow-hidden rounded-full bg-bg-soft" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={due.length}><div className="h-full rounded-full bg-gradient-to-r from-saffron to-turmeric transition-all" style={{ width: `${(doneCount / due.length) * 100}%` }} /></div>}
        {habits.length === 0 ? (
          <div className="py-6 text-center"><p className="text-4xl" aria-hidden>🌱</p><p className="mt-2 font-semibold">No habits yet</p><p className="text-sm text-ink-soft">Add one below — start with just one or two.</p></div>
        ) : (
          <ul className="space-y-2">{habits.map((h) => (
            <HabitRow key={h.id} h={h} date={today} trailing={
              <form action={archiveHabitAction.bind(null, h.id)} className="shrink-0"><button className="rounded-full px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-bg-soft" aria-label={`Archive ${h.name}`} title="Archive">✕</button></form>
            } />
          ))}</ul>
        )}
      </section>

      <section className="card rise p-6" aria-labelledby="add-h">
        <h2 id="add-h" className="mb-4 font-display text-lg font-bold">Add a habit</h2>
        <form action={addHabit} className="space-y-4">
          <div className="flex gap-3">
            <label className="w-20 text-sm font-semibold">Emoji<input name="emoji" maxLength={4} placeholder="🧘" className="field mt-1.5 text-center text-xl" /></label>
            <label className="flex-1 text-sm font-semibold">Name<input name="name" required maxLength={80} placeholder="e.g. Morning yoga" className="field mt-1.5" list="habit-ideas" /></label>
            <datalist id="habit-ideas">{SUGGESTIONS.map((s) => <option key={s} value={s.split(" ").slice(1).join(" ")} />)}</datalist>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Which days? <span className="font-normal text-ink-soft">(none selected = every day)</span></legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((d, i) => (
                <label key={d} className="cursor-pointer">
                  <input type="checkbox" name="weekday" value={i + 1} className="peer sr-only" />
                  <span className="block rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold peer-checked:border-saffron peer-checked:bg-saffron/20 peer-checked:text-saffron-deep peer-focus-visible:ring-2 peer-focus-visible:ring-saffron">{d}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn-primary">Add habit</button>
        </form>
      </section>
    </div>
  );
}
