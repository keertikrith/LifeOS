"use client";

import { useRef, useState } from "react";

export interface ChartPoint { date: string; value: number | null; value2?: number | null }
interface Common {
  points: ChartPoint[];
  unit: string;
  title: string;
  /** optional horizontal reference (e.g. weekly average, daily target) */
  refLine?: { value: number; label: string } | null;
  /** names of the primary/secondary series (tooltip + table) */
  seriesNames?: [string, string?];
  /** decimals to show in ticks and tooltips (e.g. 1 for hours, weight) */
  decimals?: number;
}

const W = 640, H = 230, PAD = { l: 46, r: 12, t: 14, b: 28 };
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

type Kind = "bars-line" | "diverging" | "bars" | "line";

function BaseChart({ kind, points, unit, title, refLine, decimals = 0, seriesNames = ["Value"], color = "var(--saffron)" }: Common & { kind: Kind; color?: string }) {
  const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: decimals });
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const n = points.length;
  const vals = points.flatMap((p) => [p.value, p.value2]).filter((v): v is number => v != null);
  if (refLine) vals.push(refLine.value);

  const { min, max } = (() => {
    const hi = Math.max(0, ...vals);
    const lo = kind === "diverging" ? Math.min(0, ...vals) : kind === "line" && vals.length ? Math.min(...vals) : 0;
    if (kind === "diverging") {
      const m = niceMax(Math.max(Math.abs(hi), Math.abs(lo)) * 1.1 || 1);
      return { min: -m, max: m };
    }
    if (kind === "line" && vals.length) {
      const pad = Math.max((hi - lo) * 0.25, 0.5);
      return { min: Math.floor(lo - pad), max: Math.ceil(hi + pad) };
    }
    return { min: 0, max: niceMax(hi * 1.08 || 1) };
  })();

  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n === 1 ? iw / 2 : (i + 0.5) * (iw / n));
  const y = (v: number) => PAD.t + ih - ((v - min) / (max - min)) * ih;
  const bw = Math.max(3, Math.min(26, (iw / n) * 0.62));
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const every = n > 14 ? 5 : 1;
  const hasData = points.some((p) => p.value != null || p.value2 != null);

  function onMove(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.floor((px - PAD.l) / (iw / n)))));
  }

  const linePath = (key: "value" | "value2") => {
    let d = "", pen = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const hp = hover != null ? points[hover] : null;
  const tipLeft = hover != null ? Math.min(Math.max((x(hover) / W) * 100, 14), 86) : 0;

  return (
    <figure className="relative">
      <figcaption className="sr-only">{title}</figcaption>
      {!hasData ? (
        <p className="grid h-[180px] place-items-center rounded-2xl bg-bg-soft px-6 text-center text-sm text-ink-soft">No data in this period yet.</p>
      ) : (
        <>
          <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y" role="img" aria-label={title} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove}>
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={t === 0 && kind === "diverging" ? 1.5 : 1} />
                <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-soft)">{fmt(t)}</text>
              </g>
            ))}
            {points.map((p, i) => (i % every === 0 || i === n - 1) && (
              <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-soft)">{n <= 7 ? weekday(p.date) : dayLabel(p.date)}</text>
            ))}

            {(kind === "bars" || kind === "bars-line") && points.map((p, i) => p.value != null && (
              <rect key={p.date} x={x(i) - bw / 2} y={y(p.value)} width={bw} height={Math.max(0, y(0) - y(p.value))} rx={4} fill={color} opacity={hover == null || hover === i ? 1 : 0.45} />
            ))}
            {kind === "diverging" && points.map((p, i) => p.value != null && (
              <rect key={p.date} x={x(i) - bw / 2} y={p.value >= 0 ? y(p.value) : y(0)} width={bw} height={Math.max(1, Math.abs(y(p.value) - y(0)))} rx={4}
                fill={p.value >= 0 ? "var(--saffron)" : "var(--leaf)"} opacity={hover == null || hover === i ? 1 : 0.45} />
            ))}
            {refLine && (
              <g>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--maroon)" strokeWidth={1.5} strokeDasharray="5 4" />
                <text x={W - PAD.r} y={y(refLine.value) - 5} textAnchor="end" fontSize="11" fill="var(--ink)">{refLine.label}</text>
              </g>
            )}
            {(kind === "bars-line" || kind === "line") && (
              <>
                <path d={linePath(kind === "line" ? "value" : "value2")} fill="none" stroke={kind === "line" ? color : "var(--maroon)"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {points.map((p, i) => {
                  const v = kind === "line" ? p.value : p.value2;
                  return v != null && n <= 31 ? <circle key={p.date} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill={kind === "line" ? color : "var(--maroon)"} stroke="var(--surface)" strokeWidth={2} /> : null;
                })}
              </>
            )}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--ink-soft)" strokeWidth={1} strokeDasharray="3 3" />}
          </svg>
          {hp && (
            <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg" style={{ left: `${tipLeft}%` }} role="status">
              <p className="mb-1 font-bold">{weekday(hp.date)}, {dayLabel(hp.date)}</p>
              <p><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: kind === "diverging" ? ((hp.value ?? 0) >= 0 ? "var(--saffron)" : "var(--leaf)") : color }} /> {seriesNames[0]}: <b>{hp.value == null ? "no data" : `${kind === "diverging" && hp.value > 0 ? "+" : ""}${fmt(hp.value)} ${unit}`}</b></p>
              {kind === "bars-line" && <p><span className="inline-block h-2 w-2 rounded-full bg-maroon align-middle" /> {seriesNames[1]}: <b>{hp.value2 == null ? "no burn data" : `${fmt(hp.value2)} ${unit}`}</b></p>}
            </div>
          )}
          {kind === "bars-line" && (
            <p className="mt-1 flex gap-4 text-xs text-ink-soft" aria-hidden>
              <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: color }} />{seriesNames[0]}</span>
              <span><span className="mr-1 inline-block h-0.5 w-4 align-middle bg-maroon" />{seriesNames[1]}</span>
            </p>
          )}
          <details className="mt-2 text-xs text-ink-soft">
            <summary className="cursor-pointer font-semibold">View as table</summary>
            <table className="mt-2 w-full text-left">
              <thead><tr><th className="py-1">Date</th><th>{seriesNames[0]}</th>{kind === "bars-line" && <th>{seriesNames[1]}</th>}</tr></thead>
              <tbody>{points.map((p) => <tr key={p.date} className="border-t border-line"><td className="py-1">{dayLabel(p.date)}</td><td>{p.value == null ? "—" : `${fmt(p.value)} ${unit}`}</td>{kind === "bars-line" && <td>{p.value2 == null ? "—" : `${fmt(p.value2)} ${unit}`}</td>}</tr>)}</tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  );
}

export const EatenBurnedChart = (p: Common) => <BaseChart {...p} kind="bars-line" seriesNames={["Eaten", "Burned"]} />;
export const BalanceChart = (p: Common) => <BaseChart {...p} kind="diverging" seriesNames={["Balance"]} />;
export const BarsChart = (p: Common & { color?: string }) => <BaseChart {...p} kind="bars" />;
export const LineChart = (p: Common & { color?: string }) => <BaseChart {...p} kind="line" />;
