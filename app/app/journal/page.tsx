import Link from "next/link";
import { requireSession, isDateString } from "@/lib/auth/session";
import { getJournal, recentJournal } from "@/lib/db/life";
import { MOODS, moodEmoji } from "@/lib/journal/mood";
import { saveJournalAction } from "../actions";

export const metadata = { title: "Journal · Life OS" };
export const dynamic = "force-dynamic";

const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function Journal({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams;
  const { db, userId, today } = await requireSession();
  const date = dateParam && isDateString(dateParam) && dateParam <= today ? dateParam : today;
  const [entry, recent] = await Promise.all([getJournal(db, userId, date), recentJournal(db, userId, 20)]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Journal</h1>
        <p className="text-sm text-ink-soft">Also available in Telegram: /journal for mood, or reply to the prompt with a note.</p>
      </div>

      <section className="card rise p-6" aria-labelledby="entry-h">
        <h2 id="entry-h" className="mb-1 font-display text-lg font-bold">{date === today ? "Today" : pretty(date)}</h2>
        <p className="mb-4 text-sm text-ink-soft">{pretty(date)}</p>
        <form action={saveJournalAction} className="space-y-4">
          <input type="hidden" name="date" value={date} />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Mood</legend>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <label key={m.value} className="cursor-pointer">
                  <input type="radio" name="mood" value={m.value} defaultChecked={entry?.mood === m.value} className="peer sr-only" />
                  <span className="flex flex-col items-center  border border-line bg-surface px-4 py-2 text-2xl peer-checked:border-saffron peer-checked:bg-saffron/15 peer-focus-visible:ring-2 peer-focus-visible:ring-saffron">{m.emoji}<span className="text-[10px] font-semibold text-ink-soft">{m.label}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-semibold">Notes <span className="font-normal text-ink-soft">— use #tags like #work or #family</span>
            <textarea name="notes" rows={5} maxLength={5000} defaultValue={entry?.notes ?? ""} placeholder="What stood out today? Write in any language." className="field mt-1.5 leading-relaxed" />
          </label>
          <button className="btn-primary">Save entry</button>
        </form>
      </section>

      <section className="card rise p-6" aria-labelledby="past-h">
        <h2 id="past-h" className="mb-4 font-display text-lg font-bold">Recent entries</h2>
        {recent.length === 0 ? <p className="text-sm text-ink-soft">Your entries will appear here.</p> : (
          <ul className="divide-y divide-line">
            {recent.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/app/day/${e.date}`} className="font-semibold hover:text-saffron-deep"><span className="mr-2 text-xl" aria-hidden>{moodEmoji(e.mood)}</span>{pretty(e.date)}</Link>
                  <Link href={`/app/journal?date=${e.date}`} className="text-xs font-semibold text-ink-soft underline">Edit</Link>
                </div>
                {e.notes && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-ink-soft">{e.notes}</p>}
                {e.tags.length > 0 && <p className="mt-1.5 flex flex-wrap gap-1.5">{e.tags.map((t) => <span key={t} className=" bg-bg-soft px-2.5 py-0.5 text-xs font-semibold text-saffron-deep">#{t}</span>)}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
