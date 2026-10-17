/** Small, dependency-free, server-rendered display pieces for the Insights page. */
export function HBars({ rows, unit = "", empty = "Not enough data yet." }: { rows: { label: string; value: number | null; note?: string }[]; unit?: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  if (!rows.some((r) => r.value)) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-ink-soft">{r.label}</span>
          <span className="h-2 bg-line" aria-hidden><span className="block h-full bg-ink" style={{ width: `${((r.value ?? 0) / max) * 100}%` }} /></span>
          <span className="tabular-nums">{r.value == null ? "—" : `${Math.round(r.value).toLocaleString("en-IN")}${unit}`}{r.note && <span className="ml-1 text-xs text-ink-soft">{r.note}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

const SHADES = ["transparent", "color-mix(in srgb, var(--ink) 18%, transparent)", "color-mix(in srgb, var(--ink) 38%, transparent)", "color-mix(in srgb, var(--ink) 65%, transparent)", "var(--ink)"];

/** GitHub-style grid: one cell per day, darker = more calories logged, empty = nothing logged. Oldest first, weeks as columns. */
export function Heatmap({ days }: { days: { date: string; level: number; kcal: number }[] }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1" role="img" aria-label="Daily logging heat map">
        {days.map((d) => (
          <span key={d.date} title={`${d.date}: ${d.level ? `${Math.round(d.kcal)} kcal` : "nothing logged"}`} className="h-5 w-5 border border-line" style={{ background: SHADES[d.level] }} />
        ))}
      </div>
      <p className="mt-2 flex items-center gap-2 text-xs text-ink-soft">Less {SHADES.map((c, i) => <span key={i} className="inline-block h-3 w-3 border border-line" style={{ background: c }} />)} More</p>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}
