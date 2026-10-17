import { LinkTelegram } from "@/components/link-telegram";
import { requireSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { saveSettings } from "../actions";

export const metadata = { title: "Settings · Life OS" };
export const dynamic = "force-dynamic";

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

export default async function Settings() {
  const { db, userId, tz, target, email } = await requireSession();
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
            <select name="timezone" defaultValue={tz} className="field mt-1.5">{[...new Set([tz, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}</select>
          </label>
          <label className="text-sm font-semibold">Daily target (kcal)
            <input name="calorie_target" type="number" min={500} max={10000} step={50} defaultValue={target ?? ""} placeholder="e.g. 2000" className="field mt-1.5" />
          </label>
          <div className="sm:col-span-2"><button className="btn-primary">Save settings</button></div>
        </form>
      </section>
    </div>
  );
}
