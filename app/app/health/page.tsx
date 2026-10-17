import { HealthQuickForm } from "@/components/health-quick-form";
import { TokenManager } from "@/components/token-manager";
import { requireSession } from "@/lib/auth/session";
import { healthRange } from "@/lib/db/life";
import { env } from "@/lib/env";
import { lastNDates } from "@/lib/health/balance";

export const metadata = { title: "Apple Health · Life OS" };
export const dynamic = "force-dynamic";
const fmt = (n: number | null, d = 0) => (n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d }));

export default async function HealthPage() {
  const { db, userId, today } = await requireSession();
  const dates = lastNDates(today, 7);
  const [{ data: tokens }, rows] = await Promise.all([
    db.from("api_tokens").select("id, name, token_prefix, created_at, last_used_at, revoked_at").eq("user_id", userId).order("created_at", { ascending: false }),
    healthRange(db, userId, dates[0], today),
  ]);
  const endpoint = `${env.siteUrl().replace(/\/$/, "")}/api/health/ingest`;
  const sample = `{
  "date": "2026-10-16",
  "active_kcal": 512,
  "resting_kcal": 1640,
  "steps": 8421,
  "sleep_minutes": 432,
  "weight_kg": 68.4
}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Apple Health sync</h1>
        <p className="text-sm text-ink-soft">Add your numbers by hand in 20 seconds — or set up automatic sync later. Both feed the same balance and trends.</p>
      </div>

      <section className="card rise p-6" aria-labelledby="quick-h">
        <h2 id="quick-h" className="mb-1 font-display text-lg font-bold">Quick entry</h2>
        <p className="mb-4 text-sm text-ink-soft">No setup needed. In Telegram you can also send <code>/burn 450 1600</code>, <code>/steps 8000</code> or <code>/weight 68.4</code>.</p>
        <HealthQuickForm today={today} />
      </section>

      <details className="card rise p-6">
        <summary className="cursor-pointer font-display text-lg font-bold">Automatic sync from iPhone (advanced, optional)</summary>
        <p className="mb-4 mt-2 text-sm text-ink-soft">Your iPhone can send yesterday&apos;s totals once a day. Safe to send twice — a day is saved once, never double-counted.</p>
        <div className="space-y-4">

      <section className="rounded-2xl border border-line p-5" aria-labelledby="tok-h">
        <h2 id="tok-h" className="mb-3 font-display text-lg font-bold">1 · Access tokens</h2>
        <TokenManager tokens={tokens ?? []} />
      </section>

      <section className="rounded-2xl border border-line p-5" aria-labelledby="how-h">
        <h2 id="how-h" className="mb-1 font-display text-lg font-bold">2 · Build the iPhone Shortcut</h2>
        <p className="mb-4 text-sm text-ink-soft">Takes about 10 minutes, once. Menu names can differ slightly between iOS versions.</p>
        <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed marker:font-bold marker:text-saffron-deep">
          <li><b>Create the shortcut.</b> Open <i>Shortcuts</i> → <b>+</b> → name it <b>Life OS Sync</b>.</li>
          <li><b>Pick the day to send (yesterday).</b> Add <i>Current Date</i> → <i>Adjust Date</i> (Operation: <b>Get Start of Day</b>) → rename its output <b>TodayStart</b>. Add another <i>Adjust Date</i> on that: <b>Subtract 1 Day</b> → rename <b>YesterdayStart</b>. Add <i>Format Date</i> on YesterdayStart: Date Format <b>Custom</b>, format string <code className="rounded bg-bg-soft px-1.5 py-0.5">yyyy-MM-dd</code> → rename <b>DayText</b>.</li>
          <li><b>Active calories.</b> Add <i>Find Health Samples</i>: Type <b>Active Energy</b>, filters <b>Start Date is after YesterdayStart</b> and <b>Start Date is before TodayStart</b>, turn <b>Limit off</b>. Then <i>Calculate Statistics</i> → <b>Sum</b> → rename <b>ActiveSum</b>.</li>
          <li><b>Resting calories.</b> Repeat step 3 with Type <b>Resting Energy</b> → <b>RestingSum</b>.</li>
          <li><b>Steps.</b> Repeat with Type <b>Steps</b> → <b>StepsSum</b>.</li>
          <li><b>Weight (optional).</b> <i>Find Health Samples</i>: Type <b>Weight</b>, Sort by <b>Start Date, Latest First</b>, Limit <b>1</b> → <i>Get Details of Health Samples</i> → <b>Value</b> (in kg) → rename <b>WeightKg</b>. If you didn&apos;t weigh yourself, leave this out.</li>
          <li><b>Sleep (optional).</b> <i>Find Health Samples</i>: Type <b>Sleep Analysis</b>, <b>Start Date is after YesterdayStart</b>, <b>before TodayStart</b>, Value is <b>Asleep</b> (not In Bed) → <i>Get Details</i> → <b>Duration</b> → <i>Calculate Statistics</i> Sum → convert seconds to minutes with <i>Calculate</i> (÷ 60) → rename <b>SleepMinutes</b>. If it feels fiddly, skip sleep for now.</li>
          <li><b>Send it.</b> Add <i>Get Contents of URL</i>. URL: <code className="break-all rounded bg-bg-soft px-1.5 py-0.5">{endpoint}</code>. Tap <b>Show More</b>: Method <b>POST</b>. Headers: <code className="rounded bg-bg-soft px-1.5 py-0.5">Authorization</code> = <code className="rounded bg-bg-soft px-1.5 py-0.5">Bearer YOUR_TOKEN</code>. Request Body <b>JSON</b>, then add fields: <code>date</code> (Text) = DayText, <code>active_kcal</code> = ActiveSum, <code>resting_kcal</code> = RestingSum, <code>steps</code> = StepsSum, and optionally <code>weight_kg</code> = WeightKg and <code>sleep_minutes</code> = SleepMinutes.</li>
          <li><b>Check the reply.</b> Add <i>Show Notification</i> with the <i>Contents of URL</i>. You should see <code className="rounded bg-bg-soft px-1.5 py-0.5">{`{"ok":true,...}`}</code>. Allow Health access when iOS asks. Run it once by tapping ▶️.</li>
          <li><b>Automate it.</b> <i>Automation</i> tab → <b>+</b> → <b>Alarm</b> → <b>Is Stopped</b> (your morning alarm) → <i>Run Shortcut: Life OS Sync</i> → set <b>Run Immediately</b>. <br /><span className="text-ink-soft">Why the morning alarm: iOS can&apos;t read Health data while the phone is locked, and your phone is unlocked right after you stop the alarm. A fixed-time automation at night often fails for that reason. (A time-of-day automation works too if your phone is usually unlocked then.)</span></li>
        </ol>

        <h3 className="mb-2 mt-6 font-semibold">What the endpoint accepts</h3>
        <pre className="overflow-x-auto rounded-2xl bg-bg-soft p-4 text-xs leading-relaxed">{sample}</pre>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-soft">
          <li><code>date</code> is <b>your local day</b> (YYYY-MM-DD). Every other field is optional — send only what you have.</li>
          <li>A blank value is ignored, never saved as zero. Missing burn data shows as “no burn data”.</li>
          <li>Back-fill up to 31 days in one request: <code>{`{"days":[{...},{...}]}`}</code>.</li>
        </ul>
        <h3 className="mb-2 mt-5 font-semibold">Test from a terminal</h3>
        <pre className="overflow-x-auto rounded-2xl bg-bg-soft p-4 text-xs leading-relaxed">{`curl -X POST ${endpoint} \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"date":"${today}","steps":1000}'`}</pre>
      </section>

        </div>
      </details>

      <section className="card rise p-6" aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 font-display text-lg font-bold">3 · Recently synced</h2>
        {rows.length === 0 ? <p className="text-sm text-ink-soft">Nothing yet. Once your Shortcut runs, days appear here.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-soft"><tr><th className="py-2">Date</th><th>Active</th><th>Resting</th><th>Steps</th><th>Sleep</th><th>Weight</th></tr></thead>
              <tbody>{[...rows].reverse().map((r) => (
                <tr key={r.date} className="border-t border-line tabular-nums">
                  <td className="py-2 font-semibold">{r.date}</td><td>{fmt(r.active_kcal)}</td><td>{fmt(r.resting_kcal)}</td><td>{fmt(r.steps)}</td><td>{r.sleep_minutes == null ? "—" : `${fmt(r.sleep_minutes / 60, 1)} h`}</td><td>{fmt(r.weight_kg, 1)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
