"use client";

import { useState, useTransition } from "react";
import { createToken, revokeToken } from "@/app/app/actions";

export interface TokenRow { id: string; name: string; token_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never");

export function TokenManager({ tokens }: { tokens: TokenRow[] }) {
  const [name, setName] = useState("iPhone Shortcut");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const active = tokens.filter((t) => !t.revoked_at);

  function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createToken(name);
      if (res.token) { setFresh(res.token); setCopied(false); } else setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="space-y-4">
      {fresh && (
        <div className="rounded-2xl border-2 border-saffron bg-saffron/10 p-4" role="status">
          <p className="mb-2 text-sm font-bold">Copy your token now — it won&apos;t be shown again.</p>
          <code className="block break-all rounded-xl bg-surface p-3 font-mono text-sm">{fresh}</code>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary !py-2 text-sm" onClick={async () => { await navigator.clipboard.writeText(fresh); setCopied(true); }}>{copied ? "Copied ✓" : "Copy token"}</button>
            <button className="btn-ghost !py-2 text-sm" onClick={() => setFresh(null)}>I&apos;ve saved it</button>
          </div>
        </div>
      )}

      <form onSubmit={create} className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="token-name">Token name</label>
        <input id="token-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="field min-w-0 flex-1" placeholder="Token name" />
        <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Generate token"}</button>
      </form>
      {error && <p className="text-sm text-chili" role="alert">{error}</p>}

      {tokens.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-warm">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className={`font-semibold ${t.revoked_at ? "text-ink-soft line-through" : ""}`}>{t.name} <span className="ml-1 font-mono text-xs font-normal text-ink-soft">{t.token_prefix}…</span></p>
                <p className="text-xs text-ink-soft">Created {when(t.created_at)} · last used {when(t.last_used_at)}{t.revoked_at && " · revoked"}</p>
              </div>
              {!t.revoked_at && <button className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-chili hover:bg-chili-soft" disabled={pending} onClick={() => { if (confirm(`Revoke “${t.name}”? Shortcuts using it will stop working.`)) start(() => revokeToken(t.id)); }}>Revoke</button>}
            </li>
          ))}
        </ul>
      )}
      {active.length === 0 && !fresh && <p className="text-sm text-ink-soft">No active tokens. Generate one to connect your iPhone.</p>}
    </div>
  );
}
