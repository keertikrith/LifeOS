"use client";

import { useState } from "react";
import { browserClient } from "@/lib/db/browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const redirectTo = () => `${window.location.origin}/auth/callback`;

  async function google() {
    const { error } = await browserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) {
      setState("error");
      setMessage("Google sign-in isn't set up yet. Use the email link below.");
    }
  }

  async function magic(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await browserClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else setState("sent");
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={google} className="btn-ghost w-full">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
          <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>

      {state === "sent" ? (
        <p className="rounded-2xl bg-leaf-soft p-4 text-sm text-leaf" role="status">
          ✉️ Check your inbox — we sent a sign-in link to <b>{email}</b>.
        </p>
      ) : (
        <form onSubmit={magic} className="space-y-3">
          <label className="sr-only" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
          <button type="submit" disabled={state === "sending"} className="btn-primary w-full disabled:opacity-60">
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}
      {state === "error" && <p className="text-sm text-chili" role="alert">{message}</p>}
    </div>
  );
}
