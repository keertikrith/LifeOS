import { LinkTelegram } from "@/components/link-telegram";
import { requireSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { ResetForm } from "@/components/reset-form";
import { saveSettings } from "../actions";

export const metadata = { title: "Settings · Life OS" };
export const dynamic = "force-dynamic";

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

export default async function Settings() {
  const { db, userId, rawTz, dayStart, target, email } = await requireSession();
  const { data: prefs } = await db.from("profiles").select("nudges_enabled, wake_hour, sleep_hour, monthly_out_budget, monthly_drink_budget").eq("id", userId).single();
  const link = await db.from("telegram_links").select("chat_id").eq("user_id", userId).maybeSingle();
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-extrabold">Settings</h1>
      <section className="card rise p-6" aria-labelledby="tg-h">
        <h2 id="tg-h" className="mb-3 font-display text-lg font-bold">Telegram</h2>
        <LinkTelegram linked={!!link.data} botUsername={env.telegramBotUsername()} />
      </section>
      <section className="card rise p-6" aria-labelledby="set-h">
        <h2 id="set-h" className="mb-1 font-display text-lg font-bold">Preferences</h2>
        <p className="mb-4 text-sm text-ink-soft">Signed in as {email}. “Today” always follows your timezone.</p>
        <form action={saveSettings} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Timezone
            <select name="timezone" defaultValue={rawTz} className="field mt-1.5">{[...new Set([rawTz, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}</select>
          </label>
          <label className="text-sm font-semibold">Daily target (kcal)
            <input name="calorie_target" type="number" min={500} max={10000} step={50} defaultValue={target ?? ""} placeholder="e.g. 2000" className="field mt-1.5" />
          </label>
          <label className="text-sm font-semibold">My day starts at
            <select name="day_start_hour" defaultValue={dayStart} className="field mt-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{h === 0 ? "12:00 AM (midnight)" : `${h}:00 AM`}</option>)}
            </select>
            <span className="mt-1 block text-xs font-normal text-ink-soft">Anything logged before this hour counts toward the previous day, so a late night stays in one day.</span>
          </label>
          <fieldset className="grid gap-4 border-t border-line pt-4 sm:col-span-2 sm:grid-cols-2">
            <legend className="pb-2 text-sm font-semibold">Telegram check-ins</legend>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="nudges_enabled" defaultChecked={prefs?.nudges_enabled ?? true} className="h-4 w-4 accent-[var(--ink)]" /> Check on me about every 3 hours, only when there&apos;s something useful to say</label>
            <label className="text-sm font-semibold">Earliest message at
              <select name="wake_hour" defaultValue={prefs?.wake_hour ?? 7} className="field mt-1.5">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}</select>
            </label>
            <label className="text-sm font-semibold">Stop messaging at
              <select name="sleep_hour" defaultValue={prefs?.sleep_hour ?? 22} className="field mt-1.5">{Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
            </label>
          </fieldset>
          <fieldset className="grid gap-4 border-t border-line pt-4 sm:col-span-2 sm:grid-cols-2">
            <legend className="pb-2 text-sm font-semibold">Monthly social plan</legend>
            <label className="text-sm font-semibold">Eating out (times)
              <input name="monthly_out_budget" type="number" min={0} max={31} defaultValue={prefs?.monthly_out_budget ?? 4} className="field mt-1.5" />
            </label>
            <label className="text-sm font-semibold">Drinks (times)
              <input name="monthly_drink_budget" type="number" min={0} max={31} defaultValue={prefs?.monthly_drink_budget ?? 2} className="field mt-1.5" />
            </label>
          </fieldset>
          <div className="sm:col-span-2"><button className="btn-primary">Save settings</button></div>
        </form>
      </section>
      <section className="card rise p-6" aria-labelledby="reset-h">
        <h2 id="reset-h" className="mb-3 font-display text-lg font-bold">Start fresh</h2>
        <ResetForm />
      </section>
    </div>
  );
}
