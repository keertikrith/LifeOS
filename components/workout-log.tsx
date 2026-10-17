"use client";

import { useActionState, useTransition } from "react";
import { deleteWorkout, logWorkout } from "@/app/app/actions";

export interface WorkoutRow { id: string; date: string; title: string; minutes: number | null; note: string | null; sets: { exercise: string; sets: number; reps: number; weight_kg: number | null }[] }

export function WorkoutForm({ today, suggestion }: { today: string; suggestion: string }) {
  const [state, action, pending] = useActionState(logWorkout, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-semibold">Day<input type="date" name="date" defaultValue={today} max={today} className="field mt-1.5" /></label>
        <label className="text-sm font-semibold">Session<input name="title" defaultValue={suggestion} className="field mt-1.5" /></label>
        <label className="text-sm font-semibold">Minutes (optional)<input name="minutes" type="number" min={1} max={600} className="field mt-1.5" /></label>
      </div>
      <label className="block text-sm font-semibold">Lifts (optional, one per line)
        <textarea name="lifts" rows={3} placeholder={"bench press 3x8 40\nsquats 4x10 60\nplank 3x45"} className="field mt-1.5 font-mono text-sm" />
      </label>
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Log workout"}</button>
      {state.ok && <p className="text-sm font-semibold" role="status">Logged.</p>}
      {state.error && <p className="text-sm" role="alert">{state.error}</p>}
    </form>
  );
}

export function WorkoutList({ rows }: { rows: WorkoutRow[] }) {
  const [pending, start] = useTransition();
  if (!rows.length) return <p className="text-sm text-ink-soft">No workouts logged yet.</p>;
  return (
    <ul className="divide-y divide-line border border-line">
      {rows.map((w) => (
        <li key={w.id} className="px-4 py-3 text-sm">
          <p className="flex items-baseline justify-between gap-3">
            <span><b>{w.title}</b> <span className="text-ink-soft">· {new Date(`${w.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}{w.minutes ? ` · ${w.minutes} min` : ""}</span></span>
            <button className="text-xs underline" disabled={pending} onClick={() => { if (confirm("Delete this workout?")) start(() => deleteWorkout(w.id)); }}>Delete</button>
          </p>
          {w.sets.length > 0 && <p className="mt-1 text-ink-soft">{w.sets.map((s) => `${s.exercise} ${s.sets}×${s.reps}${s.weight_kg ? ` @ ${s.weight_kg} kg` : ""}`).join(" · ")}</p>}
        </li>
      ))}
    </ul>
  );
}
