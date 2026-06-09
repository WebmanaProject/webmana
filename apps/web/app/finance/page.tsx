"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAuth, authFetch } from "../lib/auth";
import { Header } from "../components/Header";

interface CurrencyTotal {
  currency: string;
  total: number;
  items: number;
}
interface CostLine {
  kind: "domain" | "project" | "cloud";
  label: string;
  projectId: string | null;
  amount: number;
  currency: string;
  period: string;
}
interface UpcomingRenewal {
  domainId: string;
  fqdn: string;
  expiresAt: string;
  daysUntil: number;
  autoRenew: boolean;
  renewalCost: number | null;
  currency: string | null;
}
interface FinanceReport {
  generatedAt: string;
  annualByCurrency: CurrencyTotal[];
  cloudByCurrency: CurrencyTotal[];
  upcomingRenewals: UpcomingRenewal[];
  lines: CostLine[];
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dueClass(days: number): string {
  if (days < 0) return "text-red-600 font-semibold";
  if (days <= 7) return "text-red-600 font-medium";
  if (days <= 30) return "text-amber-600 font-medium";
  return "text-text";
}

const KIND_META: Record<CostLine["kind"], { label: string; cls: string }> = {
  domain: { label: "Domain", cls: "bg-accent/15 text-accent-strong" },
  project: { label: "Project", cls: "bg-amber-100 text-amber-700" },
  cloud: { label: "Cloud", cls: "bg-sky-100 text-sky-700" },
};

export default function FinancePage() {
  useRequireAuth();
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await authFetch("/api/finance");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`API ${res.status}`);
      setReport((await res.json()) as FinanceReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <Header links={[{ href: "/dashboard", label: "← Portfolio" }, { href: "/domains", label: "Domains" }]} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
          <p className="mt-0.5 text-sm text-text-muted">Recurring renewals, cloud spend, and upcoming payments.</p>
        </div>

        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading ? (
          <p className="text-text-muted">Loading…</p>
        ) : !report ? (
          <p className="text-text-muted">No data.</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              <div className="card p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-text-muted">Annual renewals</div>
                {report.annualByCurrency.length === 0 ? (
                  <p className="mt-2 text-sm text-text-muted">No renewal costs recorded.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    {report.annualByCurrency.map((c) => (
                      <span key={c.currency} className="text-2xl font-semibold">
                        {fmt(c.total)} <span className="text-sm font-normal text-text-muted">{c.currency}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-text-muted">domains + projects, per year</p>
              </div>

              <div className="card p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-text-muted">Cloud (month-to-date)</div>
                {report.cloudByCurrency.length === 0 ? (
                  <p className="mt-2 text-sm text-text-muted">No recent cloud cost data.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    {report.cloudByCurrency.map((c) => (
                      <span key={c.currency} className="text-2xl font-semibold">
                        {fmt(c.total)} <span className="text-sm font-normal text-text-muted">{c.currency}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-text-muted">latest AWS Cost Explorer reading</p>
              </div>
            </div>

            {/* Upcoming renewals */}
            <section className="mb-8">
              <h2 className="mb-3 text-base font-semibold">Upcoming renewals (90 days)</h2>
              {report.upcomingRenewals.length === 0 ? (
                <p className="text-sm text-text-muted">Nothing due in the next 90 days.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border shadow-card">
                  <table className="w-full text-sm">
                    <thead className="bg-bg-subtle text-left text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-4 py-2.5">Domain</th>
                        <th className="px-4 py-2.5">Expires</th>
                        <th className="px-4 py-2.5">Due in</th>
                        <th className="px-4 py-2.5">Auto-renew</th>
                        <th className="px-4 py-2.5 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.upcomingRenewals.map((r) => (
                        <tr key={r.domainId} className="border-t border-border">
                          <td className="px-4 py-2.5 font-mono">{r.fqdn}</td>
                          <td className="px-4 py-2.5">{r.expiresAt}</td>
                          <td className={`px-4 py-2.5 ${dueClass(r.daysUntil)}`}>
                            {r.daysUntil < 0 ? `${-r.daysUntil}d ago` : `${r.daysUntil}d`}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${r.autoRenew ? "bg-accent/15 text-accent-strong" : "bg-bg-subtle text-text-muted"}`}>
                              {r.autoRenew ? "on" : "off"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {r.renewalCost != null ? `${fmt(r.renewalCost)} ${r.currency ?? ""}` : <span className="text-text-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Cost breakdown */}
            <section>
              <h2 className="mb-3 text-base font-semibold">Cost breakdown</h2>
              {report.lines.length === 0 ? (
                <p className="text-sm text-text-muted">No cost lines yet. Add renewal costs to domains or projects.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border shadow-card">
                  <table className="w-full text-sm">
                    <thead className="bg-bg-subtle text-left text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5">Item</th>
                        <th className="px-4 py-2.5">Period</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.lines.map((l, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-4 py-2.5">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${KIND_META[l.kind].cls}`}>
                              {KIND_META[l.kind].label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {l.projectId ? (
                              <a href={`/projects/${l.projectId}`} className="hover:text-accent-strong">{l.label}</a>
                            ) : (
                              l.label
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-text-muted">{l.period}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{fmt(l.amount)} {l.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="mt-4 text-xs text-text-muted">
              Generated {new Date(report.generatedAt).toLocaleString()}.
            </p>
          </>
        )}
      </main>
    </>
  );
}
