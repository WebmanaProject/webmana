"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRequireAuth, authFetch } from "../lib/auth";

interface DomainProject {
  id: string;
  name: string;
  primary: boolean;
}

interface DomainView {
  id: string;
  fqdn: string;
  registrar: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  autoRenew: boolean;
  nameservers: string[];
  locked: boolean;
  renewalCost: number | null;
  costCurrency: string | null;
  notes: string | null;
  projects: DomainProject[];
}

function expiryClass(days: number | null): string {
  if (days === null) return "text-text-muted";
  if (days < 0) return "text-red-600 font-semibold";
  if (days <= 7) return "text-red-600 font-medium";
  if (days <= 30) return "text-amber-600 font-medium";
  if (days <= 60) return "text-amber-500";
  return "text-text";
}

export default function DomainsPage() {
  useRequireAuth();
  const [domains, setDomains] = useState<DomainView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-domain form
  const [fqdn, setFqdn] = useState("");
  const [registrar, setRegistrar] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [renewalCost, setRenewalCost] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [autoRenew, setAutoRenew] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await authFetch("/api/domains");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`API ${res.status}`);
      setDomains((await res.json()) as DomainView[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  const addDomain = () =>
    run(async () => {
      const res = await authFetch("/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fqdn,
          registrar: registrar || null,
          expiresAt: expiresAt || null,
          renewalCost: renewalCost ? Number(renewalCost) : null,
          costCurrency: currency || null,
          autoRenew,
        }),
      });
      if (!res.ok) throw new Error(`Add failed (${res.status})`);
      setFqdn(""); setRegistrar(""); setExpiresAt(""); setRenewalCost(""); setAutoRenew(false);
    });

  // Annual spend grouped by currency.
  const spendByCurrency = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const d of domains) {
      if (d.renewalCost != null) {
        const cur = d.costCurrency ?? "?";
        acc[cur] = (acc[cur] ?? 0) + d.renewalCost;
      }
    }
    return acc;
  }, [domains]);

  const upcoming = domains.filter((d) => d.daysUntilExpiry != null && d.daysUntilExpiry <= 60 && !d.autoRenew).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Domains</h1>
            <p className="mt-0.5 text-sm text-text-muted">
              {domains.length} domain{domains.length === 1 ? "" : "s"}
              {upcoming > 0 && <> · <span className="text-amber-600">{upcoming} renewing within 60 days</span></>}
            </p>
          </div>
          {Object.keys(spendByCurrency).length > 0 && (
            <div className="rounded-xl border border-border bg-surface px-4 py-2 text-sm shadow-card">
              <span className="text-text-muted">Annual renewals: </span>
              {Object.entries(spendByCurrency).map(([cur, sum], i) => (
                <span key={cur} className="font-medium">
                  {i > 0 ? " + " : ""}{sum.toFixed(2)} {cur}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Add domain */}
        <section className="card mb-8 p-5">
          <h2 className="mb-4 text-base font-semibold">Add domain</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <input className="input" placeholder="example.com" value={fqdn} onChange={(e) => setFqdn(e.target.value)} />
            <input className="input" placeholder="Registrar (optional)" value={registrar} onChange={(e) => setRegistrar(e.target.value)} />
            <label className="flex flex-col text-xs text-text-muted">
              Expiry date
              <input className="input mt-1" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
            <input className="input" type="number" step="0.01" placeholder="Renewal / yr" value={renewalCost} onChange={(e) => setRenewalCost(e.target.value)} />
            <input className="input uppercase" maxLength={3} placeholder="USD" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
              Auto-renew
            </label>
          </div>
          <button onClick={addDomain} disabled={busy || !fqdn.trim()} className="btn-accent mt-4 disabled:opacity-50">
            Add domain
          </button>
        </section>

        {loading ? (
          <p className="text-text-muted">Loading…</p>
        ) : domains.length === 0 ? (
          <p className="text-text-muted">No domains yet — add one above.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-bg-subtle text-left text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2.5">Domain</th>
                  <th className="px-4 py-2.5">Expires</th>
                  <th className="px-4 py-2.5">Auto-renew</th>
                  <th className="px-4 py-2.5">Renewal</th>
                  <th className="px-4 py-2.5">Projects</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-mono font-medium">{d.fqdn}</div>
                      {d.registrar && <div className="text-xs text-text-muted">{d.registrar}</div>}
                    </td>
                    <td className={`px-4 py-3 ${expiryClass(d.daysUntilExpiry)}`}>
                      {d.expiresAt ? (
                        <>
                          {d.expiresAt}
                          {d.daysUntilExpiry != null && (
                            <span className="ml-1 text-xs">
                              ({d.daysUntilExpiry < 0 ? `${-d.daysUntilExpiry}d ago` : `${d.daysUntilExpiry}d`})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${d.autoRenew ? "bg-accent/15 text-accent-strong" : "bg-bg-subtle text-text-muted"}`}>
                        {d.autoRenew ? "on" : "off"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {d.renewalCost != null ? `${d.renewalCost} ${d.costCurrency ?? ""}` : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {d.projects.length === 0 ? (
                        <span className="text-xs text-text-muted">parked</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {d.projects.map((p) => (
                            <a key={p.id} href={`/projects/${p.id}`} className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs hover:text-accent-strong">
                              {p.name}{p.primary ? " ★" : ""}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { if (confirm(`Delete domain ${d.fqdn}?`)) void run(() => authFetch(`/api/domains/${d.id}`, { method: "DELETE" }).then((r) => { if (!r.ok) throw new Error("delete failed"); })); }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </main>
  );
}
