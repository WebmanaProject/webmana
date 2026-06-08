"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/auth";

export default function AcceptInvitePage() {
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (t) setToken(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/invite/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `Failed (${res.status}).`);
        return;
      }
      setDone(true);
    } catch {
      setError(`Could not reach the API at ${API_BASE}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Join Webmana</h1>
        {done ? (
          <p className="mt-4 text-sm">
            Account created. <a href="/login" className="text-accent-strong hover:underline">Sign in →</a>
          </p>
        ) : (
          <>
            <p className="mt-1 mb-6 text-sm text-text-muted">Set up your account to accept the invitation.</p>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <input placeholder="Invite token" value={token} onChange={(e) => setToken(e.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm" required />
              <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
              <input type="password" autoComplete="new-password" placeholder="Choose a password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm" required />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={busy} className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">
                {busy ? "Creating…" : "Create account"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
