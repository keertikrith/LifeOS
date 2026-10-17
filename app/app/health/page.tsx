import { HealthQuickForm } from "@/components/health-quick-form";
import { TokenManager } from "@/components/token-manager";
import { requireSession } from "@/lib/auth/session";
import { healthRange } from "@/lib/db/life";
import { env } from "@/lib/env";
import { lastNDates } from "@/lib/health/balance";

export const metadata = { title: "Health · Life OS" };
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
  "active_kcal": 512,
  "resting_kcal": 1640,
  "steps": 8421,
  "sleep_minutes": 432,
  "weight_kg": 68.4
}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Health numbers</h1>
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
        <h2 id="how-h" className="mb-1 font-display text-lg font-bold">2 · Build the iPhone Shortcut (5 minutes)</h2>
        <p className="mb-4 text-sm text-ink-soft">Sends <b>today&apos;s</b> steps, active and resting calories. No dates to set. Menu names can differ slightly between iOS versions.</p>
        <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed marker:font-bold marker:text-saffron-deep">
          <li><b>Create it.</b> Open the <i>Shortcuts</i> app → tap <b>+</b> (top right) → tap the name at the top → <b>Rename</b> → <b>Send Health to Life OS</b>.</li>
          <li><b>Steps.</b> Tap <b>Add Action</b>, search <i>Find Health Samples</i>, add it. Tap <b>Add Filter</b> → <b>Type</b> → <b>Steps</b>. Add a second filter: <b>Start Date</b> → <b>is Today</b>. Turn <b>Limit</b> off.</li>
          <li>Add the action <i>Calculate Statistics</i> → set it to <b>Sum</b>. Then add <i>Set Variable</i> and name the variable <b>Steps</b>.</li>
          <li><b>Active calories.</b> Repeat steps 2–3, but choose Type <b>Active Energy</b> and name the variable <b>Active</b>.</li>
          <li><b>Resting calories.</b> Repeat again with Type <b>Resting Energy</b> and name the variable <b>Resting</b>.</li>
          <li><b>Send.</b> Add <i>Get Contents of URL</i>. In the URL box paste <code className="break-all rounded bg-bg-soft px-1.5 py-0.5">{endpoint}</code>. Tap the small arrow to <b>Show More</b> and set <b>Method</b> to <b>POST</b>.</li>
          <li><b>Header.</b> Under <b>Headers</b> tap <b>Add new header</b>: Key <code className="rounded bg-bg-soft px-1.5 py-0.5">Authorization</code>, Text <code className="rounded bg-bg-soft px-1.5 py-0.5">Bearer</code> then a space, then your token from step 1 above.</li>
          <li><b>Body.</b> Set <b>Request Body</b> to <b>JSON</b>. Tap <b>Add new field</b> three times, choosing type <b>Number</b> each time: key <code>steps</code> → tap the value and pick variable <b>Steps</b>; key <code>active_kcal</code> → <b>Active</b>; key <code>resting_kcal</code> → <b>Resting</b>.</li>
          <li><b>First run.</b> Tap ▶️. iOS will ask for Health access: tap <b>Allow</b> for all three. Add <i>Show Result</i> at the end if you want to see <code className="rounded bg-bg-soft px-1.5 py-0.5">{`{"ok":true,...}`}</code>. Then check “Recent days” below.</li>
          <li><b>Make it one tap.</b> Easiest: <i>Settings → Accessibility → Touch → Back Tap → Double Tap</i> → pick <b>Send Health to Life OS</b>. Or in Shortcuts tap the shortcut’s ⓘ → <b>Add to Home Screen</b>. Run it in the evening when your phone is unlocked.<br /><span className="text-ink-soft">Why not a timed automation: iOS can&apos;t read Health data while the phone is locked, so a 10 pm automation often fails silently.</span></li>
        </ol>

        <h3 className="mb-2 mt-6 font-semibold">What the endpoint accepts</h3>
        <pre className="overflow-x-auto rounded-2xl bg-bg-soft p-4 text-xs leading-relaxed">{sample}</pre>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-soft">
          <li><code>date</code> is optional: leave it out and it means <b>today in your timezone</b> (or send YYYY-MM-DD for another day). Every metric is optional — send only what you have.</li>
          <li>A blank value is ignored, never saved as zero. Missing burn data shows as “no burn data”.</li>
          <li>Back-fill up to 31 days in one request: <code>{`{"days":[{...},{...}]}`}</code>.</li>
        </ul>
        <h3 className="mb-2 mt-5 font-semibold">Test from a terminal</h3>
        <pre className="overflow-x-auto rounded-2xl bg-bg-soft p-4 text-xs leading-relaxed">{`curl -X POST ${endpoint} \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"steps":1000}'`}</pre>
      </section>

        </div>
      </details>

      <section className="card rise p-6" aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 font-display text-lg font-bold">Recent days</h2>
        {rows.length === 0 ? <p className="text-sm text-ink-soft">Nothing yet. Add your first day above and it will appear here.</p> : (
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
