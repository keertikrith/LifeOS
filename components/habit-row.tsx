import { toggleHabit } from "@/app/app/actions";
import { describeWeekdays } from "@/lib/habits/schedule";
import type { HabitStatus } from "@/lib/db/life";

/** One habit with a big, thumb-friendly check button. Works without JS (plain form post). */
export function HabitRow({ h, date, compact = false }: { h: HabitStatus; date: string; compact?: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-2xl border border-line bg-surface-warm px-4 ${compact ? "py-2.5" : "py-3"} ${h.scheduled ? "" : "opacity-60"}`}>
      <form action={toggleHabit.bind(null, h.id, date)}>
        <button aria-pressed={h.done} aria-label={`${h.done ? "Unmark" : "Mark"} ${h.name} as done`}
          className={`grid h-9 w-9 place-items-center rounded-full border-2 text-lg transition-all ${h.done ? "border-leaf bg-leaf text-white" : "border-line bg-surface text-transparent hover:border-saffron hover:text-saffron/50"}`}>✓</button>
      </form>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${h.done ? "text-ink-soft line-through decoration-leaf/60" : ""}`}><span aria-hidden>{h.emoji}</span> {h.name}</p>
        {!compact && <p className="text-xs text-ink-soft">{describeWeekdays(h.weekdays)}{!h.scheduled && " · rest day"}</p>}
      </div>
      {h.streak > 0 && <span className="rounded-full bg-bg-soft px-2.5 py-1 text-xs font-bold text-saffron-deep"><span className="flame" aria-hidden>🔥</span> {h.streak}</span>}
    </li>
  );
}
