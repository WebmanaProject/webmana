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
interface AlertChannel {
  id: string;
  kind: "webhook" | "slack" | "email";
  config: Record<string, string>;
  minSeverity: "info" | "warning" | "critical";
  tagFilter: string | null;
}

const CHANNEL_TARGET_KEY: Record<AlertChannel["kind"], string> = {
  webhook: "url",
  slack: "webhookUrl",
  email: "to",
};

export default function SettingsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [fx, setFx] = useState<{ baseCurrency: string; rates: { currency: string; rateToBase: number }[] }>({ baseCurrency: "USD", rates: [] });
  const [baseCcy, setBaseCcy] = useState("USD");
  const [rateCcy, setRateCcy] = useState("");
  const [rateVal, setRateVal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  // Forms
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteEmailed, setInviteEmailed] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenRole, setTokenRole] = useState("viewer");
  const [newToken, setNewToken] = useState<string | null>(null);
  // Alert channel form
  const [chKind, setChKind] = useState<"webhook" | "slack" | "email">("webhook");
  const [chTarget, setChTarget] = useState("");
  const [chMinSeverity, setChMinSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [chTag, setChTag] = useState("");

  const reload = useCallback(async () => {
    const res = await authFetch("/api/org/members");
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) setMembers((await res.json()) as Member[]);
    const [iRes, tRes, cRes] = await Promise.all([
      authFetch("/api/org/invitations"),
      authFetch("/api/org/mcp-tokens"),
      authFetch("/api/manage/alert-channels"),
    ]);
    if (iRes.ok) setInvitations((await iRes.json()) as Invitation[]);
    if (tRes.ok) setTokens((await tRes.json()) as McpToken[]);
    if (cRes.ok) setChannels((await cRes.json()) as AlertChannel[]);
    const fxRes = await authFetch("/api/manage/fx");
    if (fxRes.ok) {
      const f = (await fxRes.json()) as { baseCurrency: string; rates: { currency: string; rateToBase: number }[] };
      setFx(f);
      setBaseCcy(f.baseCurrency);
    }
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
      const body = (await res.json()) as { token: string; emailed?: boolean };
      setInviteToken(body.token);
      setInviteEmailed(Boolean(body.emailed));
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

  const createChannel = () =>
    run(async () => {
      const res = await authFetch("/api/manage/alert-channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: chKind,
          config: { [CHANNEL_TARGET_KEY[chKind]]: chTarget.trim() },
          minSeverity: chMinSeverity,
          tagFilter: chTag.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`channel failed (${res.status})`);
      setChTarget("");
      setChTag("");
    });

  const saveBaseCurrency = () =>
    run(async () => {
      const res = await authFetch("/api/manage/fx", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseCurrency: baseCcy }),
      });
      if (!res.ok) throw new Error(`base currency failed (${res.status})`);
    });

  const upsertRate = () =>
    run(async () => {
      const res = await authFetch("/api/manage/fx/rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currency: rateCcy, rateToBase: Number(rateVal) }),
      });
      if (!res.ok) throw new Error(`rate failed (${res.status})`);
      setRateCcy("");
      setRateVal("");
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
            <p className="mb-1 font-medium text-accent-strong">
              {inviteEmailed ? "✓ Invitation emailed — link (also valid):" : "Invite link (share once):"}
            </p>
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

      {/* Currency & FX */}
      <section className="mb-8 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">Currency &amp; FX</h2>
        <p className="mb-4 text-sm text-text-muted">Finance totals are normalized into your base currency using these manual rates.</p>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-text-muted">
            Base currency
            <input value={baseCcy} onChange={(e) => setBaseCcy(e.target.value.toUpperCase())} maxLength={8} className="mt-1 block w-28 rounded-lg border border-border bg-bg px-3 py-2 text-sm uppercase" />
          </label>
          <button onClick={saveBaseCurrency} disabled={busy || !baseCcy.trim()} className="rounded-lg border border-border px-3 py-2 text-sm hover:border-accent disabled:opacity-50">Save</button>
        </div>
        {fx.rates.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1.5">
            {fx.rates.map((r) => (
              <li key={r.currency} className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm">
                <span className="tabular-nums">1 {r.currency} = {r.rateToBase} {fx.baseCurrency}</span>
                <button
                  onClick={() => run(() => authFetch(`/api/manage/fx/rates/${r.currency}`, { method: "DELETE" }).then((x) => { if (!x.ok) throw new Error("delete failed"); }))}
                  className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >Delete</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-text-muted">
            Currency
            <input value={rateCcy} onChange={(e) => setRateCcy(e.target.value.toUpperCase())} maxLength={8} placeholder="PLN" className="mt-1 block w-24 rounded-lg border border-border bg-bg px-3 py-2 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-text-muted">
            1 unit = ? {fx.baseCurrency}
            <input value={rateVal} onChange={(e) => setRateVal(e.target.value)} type="number" step="0.0001" placeholder="0.25" className="mt-1 block w-28 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          </label>
          <button onClick={upsertRate} disabled={busy || !rateCcy.trim() || !(Number(rateVal) > 0)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">Set rate</button>
        </div>
      </section>

      {/* Alert channels */}
      <section className="mb-8 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">Alert channels</h2>
        <p className="mb-4 text-sm text-text-muted">Where alerts are delivered. Route by minimum severity and an optional project tag.</p>
        {channels.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {channels.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium capitalize">{c.kind}</span>
                  <code className="break-all text-xs text-text-muted">{c.config[CHANNEL_TARGET_KEY[c.kind]] ?? ""}</code>
                  <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-text-muted">≥ {c.minSeverity}</span>
                  {c.tagFilter && <span className="rounded bg-bg px-1.5 py-0.5 text-xs text-text-muted">#{c.tagFilter}</span>}
                </span>
                <button
                  onClick={() => { if (confirm("Delete this channel?")) void run(() => authFetch(`/api/manage/alert-channels/${c.id}`, { method: "DELETE" }).then((r) => { if (!r.ok) throw new Error("delete failed"); })); }}
                  className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >Delete</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <select value={chKind} onChange={(e) => setChKind(e.target.value as typeof chKind)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
            <option value="webhook">Webhook</option>
            <option value="slack">Slack</option>
            <option value="email">Email</option>
          </select>
          <input
            value={chTarget}
            onChange={(e) => setChTarget(e.target.value)}
            placeholder={chKind === "email" ? "alerts@example.com" : "https://…"}
            className="min-w-[12rem] flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          />
          <select value={chMinSeverity} onChange={(e) => setChMinSeverity(e.target.value as typeof chMinSeverity)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm" title="Minimum severity">
            <option value="info">≥ info</option>
            <option value="warning">≥ warning</option>
            <option value="critical">≥ critical</option>
          </select>
          <input value={chTag} onChange={(e) => setChTag(e.target.value)} placeholder="tag (optional)" className="w-32 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
          <button onClick={createChannel} disabled={busy || !chTarget.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">Add</button>
        </div>
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
