"use client";

import { useActionState } from "react";
import { saveCoach } from "@/app/app/actions";
import { ACTIVITY } from "@/lib/coach/calc";
import type { CoachProfile } from "@/lib/coach/load";

const Seg = ({ name, options, def }: { name: string; options: { v: string; label: string; hint?: string }[]; def?: string }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {options.map((o) => (
      <label key={o.v} className="cursor-pointer">
        <input type="radio" name={name} value={o.v} defaultChecked={def === o.v} required className="peer sr-only" />
        <span className="block border border-line px-4 py-3 text-sm transition-colors peer-checked:border-ink peer-checked:bg-ink peer-checked:text-bg peer-focus-visible:ring-2 peer-focus-visible:ring-ink">
          <b className="block">{o.label}</b>{o.hint && <span className="text-xs opacity-70">{o.hint}</span>}
        </span>
      </label>
    ))}
  </div>
);

export function CoachForm({ profile, age, currentWeight }: { profile: CoachProfile | null; age: number | null; currentWeight: number | null }) {
  const [state, action, pending] = useActionState(saveCoach, {});
  const L = "block text-sm font-semibold";
  return (
    <form action={action} className="space-y-6">
      <fieldset className="space-y-2"><legend className="mb-1 text-sm font-semibold">Sex <span className="font-normal text-ink-soft">(used only for the calorie formula)</span></legend>
        <Seg name="sex" def={profile?.sex} options={[{ v: "female", label: "Female" }, { v: "male", label: "Male" }, { v: "other", label: "Other / prefer not to say" }]} />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={L}>Age<input name="age" type="number" min={18} max={90} required defaultValue={age ?? ""} className="field mt-1.5" placeholder="e.g. 28" /></label>
        <label className={L}>Height (cm)<input name="height_cm" type="number" min={120} max={230} step="0.5" required defaultValue={profile?.height_cm ?? ""} className="field mt-1.5" placeholder="e.g. 170" /></label>
        <label className={L}>Current weight (kg)<input name="weight_kg" type="number" min={30} max={300} step="0.1" required defaultValue={currentWeight ?? ""} className="field mt-1.5" placeholder="e.g. 78" /></label>
        <label className={L}>Goal weight (kg)<input name="goal_weight_kg" type="number" min={30} max={300} step="0.1" required defaultValue={profile?.goal_weight_kg ?? ""} className="field mt-1.5" placeholder="e.g. 70" /></label>
        <label className={`${L} sm:col-span-2`}>Target date <span className="font-normal text-ink-soft">(optional — leave blank for a steady, safe pace)</span><input name="goal_date" type="date" defaultValue={profile?.goal_date ?? ""} className="field mt-1.5" /></label>
      </div>
      <fieldset className="space-y-2"><legend className="mb-1 text-sm font-semibold">How active is a normal week?</legend>
        <Seg name="activity" def={profile?.activity} options={Object.entries(ACTIVITY).map(([v, a]) => ({ v, label: a.label, hint: a.hint }))} />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={L}>Workout days per week
          <select name="days_per_week" defaultValue={profile?.days_per_week ?? 3} className="field mt-1.5">{[2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
        </label>
        <fieldset><legend className="mb-1 text-sm font-semibold">Where?</legend><Seg name="equipment" def={profile?.equipment ?? "home"} options={[{ v: "home", label: "At home" }, { v: "gym", label: "Gym" }]} /></fieldset>
        <fieldset><legend className="mb-1 text-sm font-semibold">Experience</legend><Seg name="experience" def={profile?.experience ?? "beginner"} options={[{ v: "beginner", label: "Beginner" }, { v: "intermediate", label: "Intermediate" }]} /></fieldset>
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "Working it out…" : profile ? "Update my plan" : "Create my plan"}</button>
      {state.ok && <p className="border border-ink p-3 text-sm font-semibold" role="status">Plan updated. Your daily calorie target is now set.</p>}
      {state.error && <p className="border border-line bg-bg-soft p-3 text-sm" role="alert">{state.error}</p>}
    </form>
  );
}
