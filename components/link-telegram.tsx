"use client";

import { useState, useTransition } from "react";
import { generateLinkCode, unlinkTelegram, type LinkState } from "@/app/app/actions";

export function LinkTelegram({ linked, botUsername }: { linked: boolean; botUsername: string }) {
  const [state, setState] = useState<LinkState>({});
  const [pending, start] = useTransition();

  if (linked) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-leaf"><span aria-hidden></span> Telegram is linked. Message the bot what you ate!</p>
        <button className="text-xs font-semibold text-ink-soft underline" onClick={() => start(() => unlinkTelegram())} disabled={pending}>Unlink</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">Link once, then log meals just by chatting. Your code works for 15 minutes.</p>
      {state.code ? (
        <div className="space-y-3  bg-bg-soft p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your one-time code</p>
          <p className="font-mono text-3xl font-bold tracking-[0.25em] text-maroon" aria-live="polite">{state.code}</p>
          {state.deepLink ? (
            <a href={state.deepLink} target="_blank" rel="noreferrer" className="btn-primary w-full">Open in Telegram →</a>
          ) : (
            <p className="text-sm">Open the bot{botUsername && !botUsername.startsWith("PASTE") ? ` @${botUsername}` : ""} in Telegram and send:<br /><code className="font-mono font-bold">/start {state.code}</code></p>
          )}
        </div>
      ) : (
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => setState(await generateLinkCode()))}>
          {pending ? "Creating…" : "Get my link code"}
        </button>
      )}
      {state.error && <p className="text-sm text-chili" role="alert">{state.error}</p>}
    </div>
  );
}
