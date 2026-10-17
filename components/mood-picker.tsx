import { saveJournalAction } from "@/app/app/actions";
import { MOODS } from "@/lib/journal/mood";

/** Five emoji buttons; tapping one saves the mood for that date without touching the notes. */
export function MoodQuick({ date, current }: { date: string; current: number | null }) {
  return (
    <form action={saveJournalAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="date" value={date} />
      {MOODS.map((m) => (
        <button key={m.value} name="mood" value={m.value} aria-label={m.label} aria-pressed={current === m.value}
          className={`flex flex-col items-center  border px-3 py-2 text-2xl transition-all ${current === m.value ? "border-saffron bg-saffron/15 shadow-sm" : "border-line bg-surface hover:border-saffron/60"}`}>
          {m.emoji}<span className="text-[10px] font-semibold text-ink-soft">{m.label}</span>
        </button>
      ))}
    </form>
  );
}
