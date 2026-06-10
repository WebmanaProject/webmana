"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAuth, authFetch } from "../lib/auth";

const ROLES = ["admin", "editor", "viewer"];

interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: string;
}
interface Invitation {
  email: string;
  role: string;
  expiresAt: string;
}
interface McpToken {
  id: string;
  name: string;
  role: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  // Forms
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [tokenRole, setTokenRole] = useState("viewer");
  const [newToken, setNewToken] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await authFetch("/api/org/members");
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) setMembers((await res.json()) as Member[]);
    const [iRes, tRes] = await Promise.all([
      authFetch("/api/org/invitations"),
      authFetch("/api/org/mcp-tokens"),
    ]);
    if (iRes.ok) setInvitations((await iRes.json()) as Invitation[]);
    if (tRes.ok) setTokens((await tRes.json()) as McpToken[]);
  }, []);

  useEffect(() => {
    if (!authLoading) void reload();
  }, [authLoading, reload]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const invite = () =>
    run(async () => {
      const res = await authFetch("/api/org/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) throw new Error(`invite failed (${res.status})`);
      const body = (await res.json()) as { token: string };
      setInviteToken(body.token);
      setInviteEmail("");
    });

  const createToken = () =>
    run(async () => {
      const res = await authFetch("/api/org/mcp-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: tokenName, role: tokenRole }),
      });
      if (!res.ok) throw new Error(`token failed (${res.status})`);
      const body = (await res.json()) as { token: string };
      setNewToken(body.token);
      setTokenName("");
    });

  if (authLoading) return <main className="mx-auto max-w-3xl px-6 py-12 text-text-muted">Loading…</main>;

  if (forbidden)
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-text-muted">Settings are admin-only. You are signed in as <b>{user?.role}</b>.</p>
        <a href="/dashboard" className="text-accent-strong hover:underline">← Portfolio</a>
      </main>
    );

  const inviteLink =
    inviteToken && typeof window !== "undefined"
      ? `${window.location.origin}/invite?token=${inviteToken}`
      : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-text-muted">Team members, invitations, and MCP tokens.</p>
      </div>

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Members */}
      <section className="mb-8 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Members</h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between text-sm">
              <span>{m.name ? `${m.name} · ` : ""}{m.email}</span>
              <select
                value={m.role}
                disabled={busy || m.userId === undefined}
                onChange={(e) => run(() => authFetch(`/api/org/members/${m.userId}/role`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ role: e.target.value }),
                }).then((r) => { if (!r.ok) throw new Error(`role change failed (${r.status})`); }))}
                className="rounded-md border border-border bg-bg px-2 py-1 text-xs"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </section>

      {/* Invite */}
      <section className="mb-8 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Invite a member</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            placeholder="email@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={invite} disabled={busy || !inviteEmail.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">Invite</button>
        </div>
        {inviteLink && (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-xs">
            <p className="mb-1 font-medium text-accent-strong">Invite link (share once):</p>
            <code className="break-all">{inviteLink}</code>
          </div>
        )}
        {invitations.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-text-muted">
            {invitations.map((i) => (
              <li key={i.email}>Pending: {i.email} ({i.role}) — expires {new Date(i.expiresAt).toLocaleDateString()}</li>
            ))}
          </ul>
        )}
      </section>

      {/* MCP tokens */}
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">MCP tokens</h2>
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Token name (e.g. Cursor)"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          />
          <select value={tokenRole} onChange={(e) => setTokenRole(e.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={createToken} disabled={busy || !tokenName.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">Create</button>
        </div>
        {newToken && (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-xs">
            <p className="mb-1 font-medium text-accent-strong">New token (copy now, shown once):</p>
            <code className="break-all">{newToken}</code>
          </div>
        )}
        {tokens.length > 0 && (
          <ul className="mt-4 space-y-1">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <span>{t.name} <span className="text-text-muted">({t.role})</span></span>
                <button
                  onClick={() => { if (confirm(`Revoke token "${t.name}"?`)) void run(() => authFetch(`/api/org/mcp-tokens/${t.id}`, { method: "DELETE" }).then((r)=>{if(!r.ok)throw new Error("revoke failed");})); }}
                  className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >Revoke</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
