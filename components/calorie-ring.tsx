/** Progress ring: eaten vs target. Neutral colours — going over is information, not failure. */
export function CalorieRing({ eaten, target }: { eaten: number; target: number | null }) {
  const size = 176;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target ? Math.min(eaten / target, 1) : 0;
  return (
    <div className="relative mx-auto grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={target ? `${eaten} of ${target} kilocalories` : `${eaten} kilocalories eaten`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="butt"
          stroke="var(--ink)"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-4xl tabular-nums">{eaten.toLocaleString("en-IN")}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">kcal eaten</p>
      </div>
    </div>
  );
}
