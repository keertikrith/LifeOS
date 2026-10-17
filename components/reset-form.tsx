"use client";

import { useActionState } from "react";
import { resetLogs } from "@/app/app/actions";

export function ResetForm() {
  const [state, action, pending] = useActionState(resetLogs, {});
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-ink-soft">Deletes all meals, health numbers, habit check-ins and journal entries. Your account, Telegram link, habits, food defaults and coach profile stay. This cannot be undone.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Type RESET to confirm
          <input name="confirm" className="field mt-1.5 !w-40" autoComplete="off" />
        </label>
        <button className="btn-ghost" disabled={pending}>{pending ? "Clearing…" : "Clear my logs"}</button>
      </div>
      {state.ok && <p className="text-sm font-semibold" role="status">Done. You&apos;re starting fresh.</p>}
      {state.error && <p className="text-sm" role="alert">{state.error}</p>}
    </form>
  );
}
