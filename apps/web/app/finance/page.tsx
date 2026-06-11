"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAuth, authFetch } from "../lib/auth";

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
interface ProjectProfit {
  projectId: string;
  name: string;
  currency: string;
  annualRevenue: number;
  annualCost: number;
  margin: number;
}
interface BudgetStatus {
  id: string;
  scope: "project" | "tag" | "org";
  ref: string | null;
  label: string;
  period: "monthly" | "annual";
  amount: number;
  currency: string;
  annualBudget: number;
  annualActual: number;
  pctUsed: number;
}
interface FinanceReport {
  generatedAt: string;
  annualByCurrency: CurrencyTotal[];
  cloudByCurrency: CurrencyTotal[];
  mrrByCurrency: CurrencyTotal[];
  upcomingRenewals: UpcomingRenewal[];
  profitability: ProjectProfit[];
  budgets: BudgetStatus[];
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

interface ProjectLite {
  id: string;
  name: string;
  tags: string[];
}

export default function FinancePage() {
  useRequireAuth();
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [res, pRes] = await Promise.all([authFetch("/api/finance"), authFetch("/api/projects")]);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`API ${res.status}`);
      setReport((await res.json()) as FinanceReport);
      if (pRes.ok) {
        const rows = (await pRes.json()) as { id: string; name: string; tags: string[] }[];
        setProjects(rows.map((p) => ({ id: p.id, name: p.name, tags: p.tags ?? [] })));
      }
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
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
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
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="card p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-text-muted">MRR (revenue)</div>
                {report.mrrByCurrency.length === 0 ? (
                  <p className="mt-2 text-sm text-text-muted">No revenue connector yet.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    {report.mrrByCurrency.map((c) => (
                      <span key={c.currency} className="text-2xl font-semibold tabular-nums text-accent-strong">
                        {fmt(c.total)} <span className="text-sm font-normal text-text-muted">{c.currency}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-text-muted">monthly recurring, from Stripe</p>
              </div>

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

            {/* Budgets */}
            <BudgetsSection budgets={report.budgets} projects={projects} onChanged={reload} />

            {/* Profitability */}
            {report.profitability.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-base font-semibold">Profitability (annualized)</h2>
                <div className="overflow-x-auto rounded-2xl border border-border shadow-card">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="bg-bg-subtle text-left text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-4 py-2.5">Project</th>
                        <th className="px-4 py-2.5 text-right">Revenue / yr</th>
                        <th className="px-4 py-2.5 text-right">Cost / yr</th>
                        <th className="px-4 py-2.5 text-right">Margin / yr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.profitability.map((p) => (
                        <tr key={p.projectId} className="border-t border-border">
                          <td className="px-4 py-2.5">
                            <a href={`/projects/${p.projectId}`} className="hover:text-accent-strong">{p.name}</a>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {p.annualRevenue > 0 ? `${fmt(p.annualRevenue)} ${p.currency}` : <span className="text-text-muted">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {p.annualCost > 0 ? `${fmt(p.annualCost)} ${p.currency}` : <span className="text-text-muted">—</span>}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${p.margin >= 0 ? "text-accent-strong" : "text-red-600"}`}>
                            {p.margin >= 0 ? "+" : ""}{fmt(p.margin)} {p.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Revenue = MRR × 12. Cost = domain renewals + annualized cloud run-rate. Mixed currencies are
                  not yet FX-normalized.
                </p>
              </section>
            )}

            {/* Upcoming renewals */}
            <section className="mb-8">
              <h2 className="mb-3 text-base font-semibold">Upcoming renewals (90 days)</h2>
              {report.upcomingRenewals.length === 0 ? (
                <p className="text-sm text-text-muted">Nothing due in the next 90 days.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border shadow-card">
                  <table className="w-full min-w-[34rem] text-sm">
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
                <div className="overflow-x-auto rounded-2xl border border-border shadow-card">
                  <table className="w-full min-w-[34rem] text-sm">
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
  );
}

/* ------------------------------------------------------------- Budgets ----- */

function barClass(pct: number): string {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 80) return "bg-amber-400";
  return "bg-accent";
}

function BudgetsSection({
  budgets,
  projects,
  onChanged,
}: {
  budgets: FinanceReport["budgets"];
  projects: ProjectLite[];
  onChanged: () => void;
}) {
  const [scope, setScope] = useState<"project" | "tag" | "org">("project");
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allTags = Array.from(new Set(projects.flatMap((p) => p.tags))).sort();

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { scope, amount: Number(amount), currency, period };
      if (scope === "project") body.ref = ref;
      if (scope === "tag") body.ref = ref;
      const res = await authFetch("/api/manage/budgets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string | string[] };
        throw new Error(Array.isArray(b.message) ? b.message.join(", ") : b.message ?? `Failed (${res.status})`);
      }
      setAmount("");
      setRef("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this budget?")) return;
    await authFetch(`/api/manage/budgets/${id}`, { method: "DELETE" });
    onChanged();
  }

  const needsRef = scope !== "org";
  const canAdd = !busy && Number(amount) > 0 && (!needsRef || ref.trim() !== "");

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold">Budgets</h2>

      {budgets.length > 0 && (
        <ul className="mb-4 flex flex-col gap-3">
          {budgets.map((b) => (
            <li key={b.id} className="card p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {b.label}{" "}
                  <span className="text-xs font-normal text-text-muted">
                    · {b.scope} · {fmt(b.amount)} {b.currency}/{b.period === "monthly" ? "mo" : "yr"}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className={`tabular-nums font-medium ${b.pctUsed >= 100 ? "text-red-600" : "text-text"}`}>
                    {b.pctUsed}%
                  </span>
                  <button onClick={() => void remove(b.id)} className="text-xs text-text-muted hover:text-red-600">
                    Delete
                  </button>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
                <div className={`h-full rounded-full ${barClass(b.pctUsed)}`} style={{ width: `${Math.min(b.pctUsed, 100)}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-text-muted tabular-nums">
                <span>{fmt(b.annualActual)} {b.currency} spent</span>
                <span>of {fmt(b.annualBudget)} {b.currency}/yr</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed border-border p-3">
        <label className="text-xs font-medium text-text-muted">
          Scope
          <select className="input mt-1 block" value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); setRef(""); }}>
            <option value="project">Project</option>
            <option value="tag">Tag</option>
            <option value="org">Whole org</option>
          </select>
        </label>
        {scope === "project" && (
          <label className="text-xs font-medium text-text-muted">
            Project
            <select className="input mt-1 block min-w-[10rem]" value={ref} onChange={(e) => setRef(e.target.value)}>
              <option value="">Select…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {scope === "tag" && (
          <label className="text-xs font-medium text-text-muted">
            Tag
            <input className="input mt-1 block" list="budget-tags" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="client" />
            <datalist id="budget-tags">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
          </label>
        )}
        <label className="text-xs font-medium text-text-muted">
          Amount
          <input className="input mt-1 block w-28" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" />
        </label>
        <label className="text-xs font-medium text-text-muted">
          Currency
          <input className="input mt-1 block w-20 uppercase" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </label>
        <label className="text-xs font-medium text-text-muted">
          Period
          <select className="input mt-1 block" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="monthly">monthly</option>
            <option value="annual">annual</option>
          </select>
        </label>
        <button onClick={add} disabled={!canAdd} className="btn-accent">Add budget</button>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Usage compares each budget (annualized) to current annual cost in scope. FX is not applied — keep a
        budget’s currency consistent with its costs.
      </p>
    </section>
  );
}
