"use client";

import { useState, useTransition } from "react";
import { createConnectLink, revokeConnectLink } from "@/app/app/actions";

export interface LinkRow { id: string; created_at: string; last_used_at: string | null; revoked_at: string | null }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never");

export function ConnectAI({ links }: { links: LinkRow[] }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const active = links.filter((l) => !l.revoked_at);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">Talk to Life OS from Claude or ChatGPT. The assistant does the thinking (calories, meals, plans) and saves everything here. Create a link, then paste it as a custom connector.</p>
      {url && (
        <div className="border border-ink p-4" role="status">
          <p className="mb-2 text-sm font-semibold">Your connect link. Treat it like a password — it&apos;s shown once.</p>
          <code className="block break-all bg-bg-soft p-3 font-mono text-xs">{url}</code>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary !py-2 text-sm" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
            <button className="btn-ghost !py-2 text-sm" onClick={() => setUrl(null)}>I&apos;ve saved it</button>
          </div>
        </div>
      )}
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => { setError(null); const r = await createConnectLink(); if (r.url) { setUrl(r.url); setCopied(false); } else setError(r.error ?? "Something went wrong."); })}>{pending ? "Creating…" : "Create connect link"}</button>
      {error && <p className="text-sm" role="alert">{error}</p>}
      {active.length > 0 && (
        <ul className="divide-y divide-line border border-line text-sm">
          {active.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>Link created {when(l.created_at)} <span className="text-ink-soft">· last used {when(l.last_used_at)}</span></span>
              <button className="text-xs underline" disabled={pending} onClick={() => { if (confirm("Revoke this link? Any app using it will stop working.")) start(() => revokeConnectLink(l.id)); }}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">How to add it</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink-soft">
          <li><b>Claude:</b> on claude.ai (website) → Settings → Connectors → Add custom connector. Name it Life OS, paste the link, save. It then appears in the Claude phone app too. Make a Project called &ldquo;Life OS&rdquo; and enable the connector there.</li>
          <li><b>ChatGPT:</b> Settings → Connectors → Advanced → turn on Developer mode, then create a connector, paste the link and choose &ldquo;No authentication&rdquo;. Availability depends on your plan.</li>
          <li>Then just say &ldquo;I had 2 dosa and filter coffee&rdquo;, &ldquo;how is my week?&rdquo; or &ldquo;log a 45 minute workout&rdquo;.</li>
        </ol>
      </details>
    </div>
  );
}
