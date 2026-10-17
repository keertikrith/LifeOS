"use client";

import { useActionState } from "react";
import { logHealthManual } from "@/app/app/actions";

const FIELDS = [
  { name: "steps", label: "Steps", ph: "e.g. 8000", step: "1" },
  { name: "active_kcal", label: "Active calories", ph: "e.g. 450", step: "1" },
  { name: "resting_kcal", label: "Resting calories", ph: "e.g. 1600", step: "1" },
  { name: "sleep_hours", label: "Sleep (hours)", ph: "e.g. 7.5", step: "0.1" },
  { name: "weight_kg", label: "Weight (kg)", ph: "e.g. 68.4", step: "0.1" },
];

export function HealthQuickForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(logHealthManual, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block max-w-xs text-sm font-semibold">Day
        <input type="date" name="date" defaultValue={today} max={today} className="field mt-1.5" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.name} className="text-sm font-semibold">{f.label}
            <input name={f.name} type="number" inputMode="decimal" min={0} step={f.step} placeholder={f.ph} className="field mt-1.5" />
          </label>
        ))}
      </div>
      <p className="text-xs text-ink-soft">Fill only what you have. Look at Health → Browse → Activity on your iPhone: “Active Energy”, “Resting Energy” and “Steps” are all there. Saving the same day again updates it.</p>
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {state.ok && <p className=" bg-leaf-soft p-3 text-sm font-semibold text-leaf" role="status">Saved ✓ — your balance and trends are updated.</p>}
      {state.error && <p className=" bg-chili-soft p-3 text-sm text-chili" role="alert">{state.error}</p>}
    </form>
  );
}
