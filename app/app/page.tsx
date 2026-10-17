import { redirect } from "next/navigation";
import { CalorieRing } from "@/components/calorie-ring";
import { LinkTelegram } from "@/components/link-telegram";
import { adminClient, userClient } from "@/lib/db/clients";
import { autoConfirmStale, confirmedLogsForDay } from "@/lib/db/meals";
import { loggingStreak } from "@/lib/db/stats";
import { env } from "@/lib/env";
import { greetingFor, nudgeFor } from "@/lib/greeting";
import { localDateString, localHour } from "@/lib/time/day";
import { saveSettings, signOut } from "./actions";

export const metadata = { title: "Today · Life OS" };
export const dynamic = "force-dynamic";

const MEAL_LABEL = { breakfast: "🌅 Breakfast", lunch: "🍛 Lunch", snack: "🫖 Snack", dinner: "🌙 Dinner" } as const;
const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];
const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

export default async function Dashboard() {
  const db = await userClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const userId = auth.user.id;

  // honour auto-confirm for logs the user never tapped on in Telegram
  await autoConfirmStale(adminClient(), userId, env.autoConfirmMinutes());

  const { data: profile } = await db.from("profiles").select("display_name, timezone, calorie_target").eq("id", userId).single();
  const tz: string = profile?.timezone ?? "Asia/Kolkata";
  const now = new Date();
  const [logs, streak, link] = await Promise.all([
    confirmedLogsForDay(db, userId, tz, now),
    loggingStreak(db, userId, tz, now),
    db.from("telegram_links").select("chat_id").eq("user_id", userId).maybeSingle(),
  ]);

  const eaten = Math.round(logs.reduce((s, l) => s + Number(l.total_kcal), 0));
  const target: number | null = profile?.calorie_target ?? null;
  const seed = Number(localDateString(now, tz).replaceAll("-", ""));
  const hello = greetingFor(localHour(now, tz), seed);
  const firstName = (profile?.display_name ?? "").split(" ")[0];
  const diff = target ? target - eaten : null;

  return (
    <div className="kolam min-h-dvh">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-5">
        <header className="mb-6 flex items-center justify-between">
          <span className="flex items-center gap-2 font-display text-xl font-bold text-maroon"><span aria-hidden>🪔</span> Life OS</span>
          <form action={signOut}><button className="btn-ghost !px-4 !py-2 text-sm">Sign out</button></form>
        </header>

        <section className="rise mb-6">
          <p className="text-sm font-semibold text-saffron-deep">{hello.native} · {hello.say}</p>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{firstName ? `${firstName},` : "Hello,"} here&apos;s your day</h1>
          <p className="mt-1 text-ink-soft">{nudgeFor(seed)}</p>
        </section>

        <div className="grid gap-4 md:grid-cols-5">
          <section className="card rise p-6 md:col-span-3" aria-labelledby="today-h">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="today-h" className="font-display text-lg font-bold">Today</h2>
              {streak > 0 && (
                <span className="rounded-full bg-bg-soft px-3 py-1 text-sm font-bold text-saffron-deep">
                  <span className="flame" aria-hidden>🔥</span> {streak}-day streak
                </span>
              )}
            </div>
            <CalorieRing eaten={eaten} target={target} />
            <p className="mt-4 text-center text-sm text-ink-soft">
              {diff === null ? "Set a daily target in Settings to see what's left." : diff >= 0 ? <>Target {fmt(target!)} · <b className="text-leaf">{fmt(diff)} kcal remaining</b></> : <>Target {fmt(target!)} · <b className="text-maroon">{fmt(-diff)} kcal above</b></>}
            </p>
            <p className="mt-1 text-center text-xs text-ink-soft">Burn data &amp; daily balance arrive with Apple Health sync.</p>
          </section>

          <section className="card rise p-6 md:col-span-2" aria-labelledby="tg-h" style={{ animationDelay: "0.08s" }}>
            <h2 id="tg-h" className="mb-3 font-display text-lg font-bold">Telegram</h2>
            <LinkTelegram linked={!!link.data} botUsername={env.telegramBotUsername()} />
          </section>
        </div>

        <section className="card rise mt-4 p-6" aria-labelledby="meals-h" style={{ animationDelay: "0.12s" }}>
          <h2 id="meals-h" className="mb-4 font-display text-lg font-bold">Meals today</h2>
          {logs.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-4xl" aria-hidden>🍽️</p>
              <p className="mt-2 font-semibold">Nothing logged yet</p>
              <p className="text-sm text-ink-soft">Message the bot something like “2 idli and filter coffee”.</p>
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

        <section className="card rise mt-4 p-6" aria-labelledby="set-h" style={{ animationDelay: "0.16s" }}>
          <h2 id="set-h" className="mb-4 font-display text-lg font-bold">Settings</h2>
          <form action={saveSettings} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Timezone
              <select name="timezone" defaultValue={tz} className="field mt-1.5">
                {[...new Set([tz, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">Daily target (kcal)
              <input name="calorie_target" type="number" min={500} max={10000} step={50} defaultValue={target ?? ""} placeholder="e.g. 2000" className="field mt-1.5" />
            </label>
            <div className="sm:col-span-2"><button className="btn-primary">Save settings</button></div>
          </form>
        </section>
      </div>
    </div>
  );
}
