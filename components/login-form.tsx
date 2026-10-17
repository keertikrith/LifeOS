"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/db/browser";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const db = browserClient();
    const { data, error } =
      mode === "signup"
        ? await db.auth.signUp({ email, password, options: { data: { full_name: name.trim() || undefined } } })
        : await db.auth.signInWithPassword({ email, password });

    if (error) {
      setBusy(false);
      setError(friendly(error.message));
      return;
    }
    // sign-up with email confirmation switched on returns no session
    if (!data.session) {
      setBusy(false);
      setError("Account created, but email confirmation is on. Check your inbox, then sign in.");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2  border border-line bg-surface p-1 text-sm font-semibold" role="tablist" aria-label="Sign in or create account">
        {(["signin", "signup"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(""); }}
            className={` py-2 transition-colors ${mode === m ? "bg-saffron/25 text-saffron-deep" : "text-ink-soft"}`}>
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <label className="block text-sm font-semibold">Your name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} placeholder="e.g. Keerti" className="field mt-1.5" />
          </label>
        )}
        <label className="block text-sm font-semibold">Email
          <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1.5" />
        </label>
        <label className="block text-sm font-semibold">Password
          <input type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1.5" />
        </label>
        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create my account"}
        </button>
      </form>
      {error && <p className=" bg-chili-soft p-3 text-sm text-chili" role="alert">{error}</p>}
    </div>
  );
}

function friendly(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match. Check them, or create an account.";
  if (/already registered|already been registered/i.test(msg)) return "That email already has an account. Try signing in instead.";
  if (/password/i.test(msg) && /(short|least|characters)/i.test(msg)) return "Please choose a password with at least 8 characters.";
  if (/rate limit/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  return msg;
}
