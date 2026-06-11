"use client";

import { useState } from "react";
import { Logo } from "../components/Logo";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ?? "http://localhost:4000";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Invalid email or password." : `Login failed (${res.status}).`);
        return;
      }
      // Redirect to the portfolio after a successful login.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : "/dashboard";
    } catch {
      setError(`Could not reach the API at ${API_URL}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-6 flex flex-col items-center gap-3">
        <Logo className="h-12 w-12 drop-shadow-[0_4px_16px_rgb(var(--accent)/0.35)]" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Web<span className="text-accent-strong">mana</span>
        </h1>
      </div>
      <div className="card animate-fade-in p-8 shadow-card-hover">
        <p className="mb-6 text-center text-sm text-text-muted">Sign in to your portfolio.</p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            autoComplete="username"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="btn-accent mt-2 w-full disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      <p className="mt-4 text-center text-xs text-text-muted">
        Public status is at <a href="/status" className="text-accent-strong hover:underline">/status</a>.
      </p>
    </main>
  );
}
