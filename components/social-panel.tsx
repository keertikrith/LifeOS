"use client";

import { useActionState, useTransition } from "react";
import { addSocialEvent, deleteSocialEvent } from "@/app/app/actions";

export interface EventRow { id: string; date: string; kind: "out" | "drinks"; allowance_kcal: number }
const LABEL = { out: "Eating out", drinks: "Drinks" } as const;

export function SocialPanel({ today, upcoming }: { today: string; upcoming: EventRow[] }) {
  const [state, action, pending] = useActionState(addSocialEvent, {});
  const [removing, start] = useTransition();
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <label className="text-sm font-semibold">Date<input type="date" name="date" min={today} defaultValue={today} className="field mt-1.5" /></label>
        <label className="text-sm font-semibold">What
          <select name="kind" className="field mt-1.5"><option value="out">Eating out</option><option value="drinks">Drinks</option></select>
        </label>
        <label className="text-sm font-semibold">Extra kcal (optional)<input name="allowance" type="number" min={0} max={3000} placeholder="600 / 500" className="field mt-1.5" /></label>
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Plan it"}</button>
      </form>
      {state.error && <p className="text-sm" role="alert">{state.error}</p>}
      {upcoming.length > 0 && (
        <ul className="divide-y divide-line border border-line text-sm">
          {upcoming.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span><b>{LABEL[e.kind]}</b> · {new Date(`${e.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} <span className="text-ink-soft">· up to +{e.allowance_kcal} kcal</span></span>
              <button className="text-xs underline" disabled={removing} onClick={() => start(() => deleteSocialEvent(e.id))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
