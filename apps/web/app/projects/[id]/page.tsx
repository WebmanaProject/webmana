"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAuth, API_BASE as API_URL } from "../../lib/auth";
import { TimeSeriesChart } from "../../components/TimeSeriesChart";

interface MetricSeries {
  name: string;
  unit: string | null;
  points: { t: string; v: number }[];
}

/** Friendly titles for known metric names. */
const METRIC_TITLES: Record<string, string> = {
  "uptime.up": "Uptime",
  "uptime.response_ms": "Response time",
  "ssl.days_until_expiry": "SSL days remaining",
};
const metricTitle = (name: string) => METRIC_TITLES[name] ?? name;

type ProjectStatus =
  | "idea"
  | "in_progress"
  | "rebuild"
  | "live"
  | "paused"
  | "archived";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "in_progress", label: "In progress" },
  { value: "rebuild", label: "Rebuild" },
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

interface ProjectDomain {
  id: string;
  fqdn: string;
  primary: boolean;
  registrar: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  purchaseCost: number | null;
  renewalCost: number | null;
  costCurrency: string | null;
  purchaseDate: string | null;
}

interface ConnectorActionMeta {
  id: string;
  title: string;
  description?: string;
  destructive: boolean;
}
interface ManagedConnector {
  id: string;
  connectorId: string;
  enabled: boolean;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  enabledActions: string[];
  actions: ConnectorActionMeta[];
}

interface ManagedProject {
  id: string;
  name: string;
  domain: string | null;
  status: ProjectStatus;
  description: string | null;
  links: Record<string, string>;
  tags: string[];
  domains: ProjectDomain[];
  connectors: ManagedConnector[];
}

interface CatalogItem {
  id: string;
  title: string;
  requiresSecrets: boolean;
  vendor: string;
  category: string;
  authKind: "none" | "api_key" | "oauth2";
  verified: boolean;
  actions: { id: string; title: string; destructive: boolean }[];
}

interface ProjectMetric {
  name: string;
  value: number;
  unit: string | null;
}
interface LiveProject {
  id: string;
  health: "healthy" | "degraded" | "down" | "unknown";
  metrics: ProjectMetric[];
  events: { severity: string; title: string; description: string | null }[];
}

interface SlaRow {
  projectId: string;
  uptimePercent: number | null;
  avgResponseMs: number | null;
  samples: number;
}

interface AlertRule {
  id: string;
  metricName: string;
  operator: string;
  threshold: number;
  severity: string;
  enabled: boolean;
}

interface Note {
  id: string;
  body: string;
  done: boolean;
  createdAt: string;
}

const OPERATOR_LABELS: Record<string, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=" };

const HEALTH_META: Record<string, { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "bg-accent/15 text-accent-strong" },
  degraded: { label: "Degraded", cls: "bg-amber-100 text-amber-700" },
  down: { label: "Down", cls: "bg-red-100 text-red-700" },
  unknown: { label: "Unknown", cls: "bg-bg-subtle text-text-muted" },
};

function severityClass(severity: string): string {
  if (severity === "critical") return "bg-red-50 text-red-700 border-red-200";
  if (severity === "warning") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-bg-subtle text-text-muted border-border";
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("not authenticated");
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  useRequireAuth();
  const [id, setId] = useState<string | null>(null);
  const [project, setProject] = useState<ManagedProject | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [allDomains, setAllDomains] = useState<{ id: string; fqdn: string }[]>([]);
  const [live, setLive] = useState<LiveProject | null>(null);
  const [sla, setSla] = useState<SlaRow | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [history, setHistory] = useState<MetricSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  const reload = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [managed, cat, doms, livRes, slaRes, insRes, ruleRes, histRes, noteRes] = await Promise.all([
        api("/manage/projects") as Promise<ManagedProject[]>,
        api("/manage/connectors") as Promise<CatalogItem[]>,
        api("/manage/domains") as Promise<{ id: string; fqdn: string }[]>,
        api("/projects") as Promise<LiveProject[]>,
        api(`/sla?projectId=${id}`).catch(() => null),
        api(`/insights?projectId=${id}`).catch(() => null),
        api(`/manage/projects/${id}/alert-rules`).catch(() => []),
        api(`/metrics/history?projectId=${id}&windowDays=30`).catch(() => []),
        api(`/manage/projects/${id}/notes`).catch(() => []),
      ]);
      const found = managed.find((p) => p.id === id) ?? null;
      setProject(found);
      setNotFound(!found);
      setCatalog(cat);
      setAllDomains(doms);
      setLive(livRes.find((p) => p.id === id) ?? null);
      if (slaRes && typeof slaRes === "object" && "projects" in slaRes) {
        setSla((slaRes as { projects: SlaRow[] }).projects.find((r) => r.projectId === id) ?? null);
      }
      if (Array.isArray(insRes)) {
        setInsight(
          (insRes as { projectId: string; summary: string | null }[]).find((r) => r.projectId === id)
            ?.summary ?? null,
        );
      }
      setRules(Array.isArray(ruleRes) ? (ruleRes as AlertRule[]) : []);
      setHistory(Array.isArray(histRes) ? (histRes as MetricSeries[]) : []);
      setNotes(Array.isArray(noteRes) ? (noteRes as Note[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  if (loading) return <main className="mx-auto max-w-4xl px-6 py-12 text-text-muted">Loading…</main>;
  if (notFound || !project)
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-text-muted">Project not found.</p>
        <a href="/manage" className="text-accent-strong hover:underline">← Back to projects</a>
      </main>
    );

  const isLive = project.status === "live" || project.status === "rebuild";
  const health = HEALTH_META[live?.health ?? "unknown"] ?? HEALTH_META.unknown!;
  const primaryDomain = project.domains.find((d) => d.primary) ?? project.domains[0];
  const linkEntries = Object.entries(project.links ?? {}).filter(([, v]) => v);

  async function changeStatus(status: ProjectStatus) {
    if (!project) return;
    setProject({ ...project, status });
    await api(`/manage/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).catch(() => void reload());
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <a href="/manage" className="mb-4 inline-block text-sm text-text-muted hover:text-accent-strong">
        ← Projects
      </a>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          {primaryDomain ? (
            <p className="mt-1 font-mono text-sm text-text-muted">{primaryDomain.fqdn}</p>
          ) : (
            <p className="mt-1 text-sm italic text-text-muted/70">no domain yet</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="badge">
            {STATUS_OPTIONS.find((s) => s.value === project.status)?.label ?? project.status}
          </span>
          {isLive && <span className={`badge ${health.cls}`}>{health.label}</span>}
          <button
            onClick={() => setEditing((v) => !v)}
            className={editing ? "btn-ghost" : "btn-accent"}
          >
            {editing ? "Done editing" : "Edit"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Edit mode — configuration panels, hidden until you click Edit. */}
      {editing && (
        <div className="mb-8 rounded-2xl border border-accent/30 bg-accent/[0.04] p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm font-medium text-text-muted">Status</span>
            <select
              value={project.status}
              onChange={(e) => void changeStatus(e.target.value as ProjectStatus)}
              className="input"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <DomainsPanel project={project} allDomains={allDomains} busy={busy} run={run} />
          <EditDetails project={project} busy={busy} run={run} />
          <ConnectorsPanel project={project} catalog={catalog} busy={busy} run={run} />
          <NotesPanel projectId={project.id} notes={notes} busy={busy} run={run} />
          <AlertRulesPanel projectId={project.id} rules={rules} run={run} />
        </div>
      )}

      {/* ---- Detail dashboard (read-only) ---- */}
      {project.connectors.length > 0 && (
        <section className="card mb-6 p-4">
          <h2 className="mb-3 text-sm font-semibold">Connectors</h2>
          <ul className="flex flex-wrap gap-2">
            {project.connectors.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-subtle px-2.5 py-1 text-xs"
                title={c.lastSyncError ?? undefined}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    c.lastSyncStatus === "ok"
                      ? "bg-accent"
                      : c.lastSyncStatus === "error"
                        ? "bg-red-500"
                        : "bg-text-muted/40"
                  }`}
                />
                <span className="font-medium">{c.connectorId}</span>
                {!c.enabled && <span className="text-text-muted">· off</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {linkEntries.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {linkEntries.map(([key, url]) => (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-accent-strong hover:border-accent"
            >
              {key} ↗
            </a>
          ))}
        </div>
      )}

      {insight && (
        <div className="mb-6 rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <div className="mb-1 text-xs font-medium text-accent-strong">✦ AI summary</div>
          <p className="text-sm">{insight}</p>
        </div>
      )}

      {/* Live monitoring */}
      {!isLive ? (
        <div className="rounded-2xl border border-dashed border-border bg-bg-subtle p-6 text-center text-sm text-text-muted">
          Monitoring starts once this project is{" "}
          <span className="font-medium">Live</span> or <span className="font-medium">Rebuild</span> and
          has a domain assigned.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Time-series charts */}
          {history.filter((s) => s.points.length > 1).length > 0 && (
            <div className="grid gap-6 sm:col-span-2 sm:grid-cols-2">
              {history
                .filter((s) => s.points.length > 1)
                .map((s) => (
                  <section key={s.name} className="card p-4">
                    <h2 className="mb-3 text-sm font-semibold">
                      {metricTitle(s.name)}{" "}
                      <span className="font-normal text-text-muted">· 30d</span>
                    </h2>
                    <TimeSeriesChart points={s.points} unit={s.unit} />
                  </section>
                ))}
            </div>
          )}

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Uptime (30d)</h2>
            {sla && sla.samples > 0 ? (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-text-muted">Uptime</span><span className="font-medium">{sla.uptimePercent}%</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Avg response</span><span>{sla.avgResponseMs ?? "—"} ms</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Samples</span><span>{sla.samples}</span></div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No uptime samples yet.</p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Latest metrics</h2>
            {!live || live.metrics.length === 0 ? (
              <p className="text-sm text-text-muted">No metrics yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {live.metrics.map((m) => (
                  <li key={m.name} className="flex justify-between">
                    <span className="text-text-muted">{m.name}</span>
                    <span className="font-medium">{m.value}{m.unit ? ` ${m.unit}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {live && live.events.length > 0 && (
            <section className="sm:col-span-2">
              <h2 className="mb-2 text-sm font-semibold">Recent events</h2>
              <ul className="flex flex-col gap-2">
                {live.events.slice(0, 8).map((e, i) => (
                  <li key={i} className={`rounded-lg border px-3 py-2 text-xs ${severityClass(e.severity)}`}>
                    <span className="font-medium">{e.title}</span>
                    {e.description ? <span> — {e.description}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

/* ------------------------------------------------------------- Domains ----- */

function DomainsPanel({
  project,
  allDomains,
  busy,
  run,
}: {
  project: ManagedProject;
  allDomains: { id: string; fqdn: string }[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [fqdn, setFqdn] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [registrar, setRegistrar] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  const [purchaseCost, setPurchaseCost] = useState("");
  const [renewalCost, setRenewalCost] = useState("");
  const [currency, setCurrency] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");

  const assigned = new Set(project.domains.map((d) => d.fqdn));
  const suggestions = allDomains.filter((d) => !assigned.has(d.fqdn));

  function resetForm() {
    setFqdn("");
    setShowDetails(false);
    setRegistrar("");
    setExpiresAt("");
    setAutoRenew(false);
    setPurchaseCost("");
    setRenewalCost("");
    setCurrency("");
    setPurchaseDate("");
  }

  const assign = () =>
    run(async () => {
      const value = fqdn.trim().toLowerCase();
      if (!value) return;
      // Assign (find-or-create) the domain, then apply optional details if any.
      const { id } = (await api(`/manage/projects/${project.id}/domains`, {
        method: "POST",
        body: JSON.stringify({ fqdn: value }),
      })) as { id: string };

      const details: Record<string, unknown> = {};
      if (registrar.trim()) details.registrar = registrar.trim();
      if (expiresAt) details.expiresAt = expiresAt;
      if (autoRenew) details.autoRenew = true;
      if (purchaseCost) details.purchaseCost = Number(purchaseCost);
      if (renewalCost) details.renewalCost = Number(renewalCost);
      if (currency.trim()) details.costCurrency = currency.trim();
      if (purchaseDate) details.purchaseDate = purchaseDate;
      if (Object.keys(details).length > 0) {
        await api(`/domains/${id}`, { method: "PATCH", body: JSON.stringify(details) });
      }
      resetForm();
    });

  return (
    <section className="card mb-6 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Domains</h2>
        <span className="text-xs text-text-muted">{project.domains.length} assigned</span>
      </div>

      {project.domains.length === 0 ? (
        <p className="mb-4 text-sm text-text-muted">
          No domains yet. Assign this project’s domain(s) below — the primary one drives monitoring.
        </p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {project.domains.map((d) => (
            <DomainRow key={d.id} projectId={project.id} domain={d} busy={busy} run={run} />
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-dashed border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            list="domain-suggestions"
            value={fqdn}
            onChange={(e) => setFqdn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !showDetails) void assign();
            }}
            placeholder="example.com"
            className="input min-w-[12rem] flex-1 font-mono"
          />
          <datalist id="domain-suggestions">
            {suggestions.map((d) => (
              <option key={d.id} value={d.fqdn} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="btn-ghost"
            aria-expanded={showDetails}
          >
            {showDetails ? "Hide details" : "+ details"}
          </button>
          <button onClick={assign} disabled={busy || !fqdn.trim()} className="btn-accent">
            Assign domain
          </button>
        </div>

        {showDetails && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-text-muted">
              Registrar
              <input className="input mt-1 w-full" value={registrar} onChange={(e) => setRegistrar(e.target.value)} placeholder="Cloudflare, GoDaddy…" />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Expiry date
              <input className="input mt-1 w-full" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium text-text-muted">
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
              Auto-renew
            </label>
            <label className="text-xs font-medium text-text-muted">
              Purchase cost
              <input className="input mt-1 w-full" type="number" step="0.01" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="12.00" />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Renewal / yr
              <input className="input mt-1 w-full" type="number" step="0.01" value={renewalCost} onChange={(e) => setRenewalCost(e.target.value)} placeholder="14.00" />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Currency
              <input className="input mt-1 w-full uppercase" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Purchase date
              <input className="input mt-1 w-full" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </label>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Type a new domain to create &amp; attach it, or pick an existing one. Add registrar &amp; cost
        details now (optional) or later via each domain’s Edit. Assign as many as you need.
      </p>
    </section>
  );
}

/** One assigned domain: summary row + expandable registry/cost editor. */
function DomainRow({
  projectId,
  domain,
  busy,
  run,
}: {
  projectId: string;
  domain: ProjectDomain;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [registrar, setRegistrar] = useState(domain.registrar ?? "");
  const [expiresAt, setExpiresAt] = useState(domain.expiresAt ?? "");
  const [autoRenew, setAutoRenew] = useState(domain.autoRenew);
  const [purchaseCost, setPurchaseCost] = useState(domain.purchaseCost?.toString() ?? "");
  const [renewalCost, setRenewalCost] = useState(domain.renewalCost?.toString() ?? "");
  const [currency, setCurrency] = useState(domain.costCurrency ?? "");
  const [purchaseDate, setPurchaseDate] = useState(domain.purchaseDate ?? "");

  const save = () =>
    run(() =>
      api(`/domains/${domain.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          registrar: registrar || null,
          expiresAt: expiresAt || null,
          autoRenew,
          purchaseCost: purchaseCost ? Number(purchaseCost) : null,
          renewalCost: renewalCost ? Number(renewalCost) : null,
          costCurrency: currency || null,
          purchaseDate: purchaseDate || null,
        }),
      }).then(() => setOpen(false)),
    );

  return (
    <li className="rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{domain.fqdn}</span>
          {domain.primary && <span className="badge bg-accent/15 text-accent-strong">primary</span>}
          {domain.expiresAt && <span className="text-xs text-text-muted">exp {domain.expiresAt}</span>}
          {domain.renewalCost != null && (
            <span className="text-xs text-text-muted">
              ↻ {domain.renewalCost} {domain.costCurrency ?? ""}/yr
            </span>
          )}
        </span>
        <span className="flex gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={busy}
            className="rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
          >
            {open ? "Close" : "Edit"}
          </button>
          {!domain.primary && (
            <button
              onClick={() =>
                run(() =>
                  api(`/manage/projects/${projectId}/domains/${domain.id}/primary`, { method: "PATCH" }),
                )
              }
              disabled={busy}
              className="rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
            >
              Make primary
            </button>
          )}
          <button
            onClick={() => {
              if (!confirm(`Detach ${domain.fqdn} from this project?`)) return;
              void run(() =>
                api(`/manage/projects/${projectId}/domains/${domain.id}`, { method: "DELETE" }),
              );
            }}
            disabled={busy}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Detach
          </button>
        </span>
      </div>

      {open && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-text-muted">
              Registrar
              <input className="input mt-1 w-full" value={registrar} onChange={(e) => setRegistrar(e.target.value)} placeholder="Cloudflare, GoDaddy…" />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Expiry date
              <input className="input mt-1 w-full" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium text-text-muted">
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
              Auto-renew
            </label>
            <label className="text-xs font-medium text-text-muted">
              Purchase cost
              <input className="input mt-1 w-full" type="number" step="0.01" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="12.00" />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Renewal / yr
              <input className="input mt-1 w-full" type="number" step="0.01" value={renewalCost} onChange={(e) => setRenewalCost(e.target.value)} placeholder="14.00" />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Currency
              <input className="input mt-1 w-full uppercase" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Purchase date
              <input className="input mt-1 w-full" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </label>
          </div>
          <div className="mt-3">
            <button onClick={save} disabled={busy} className="btn-accent">Save domain</button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------- Notes ------- */

function NotesPanel({
  projectId,
  notes,
  busy,
  run,
}: {
  projectId: string;
  notes: Note[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [body, setBody] = useState("");

  const add = () =>
    run(async () => {
      const text = body.trim();
      if (!text) return;
      await api(`/manage/projects/${projectId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      setBody("");
    });

  const openTasks = notes.filter((n) => !n.done).length;

  return (
    <section className="card mb-6 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Notes &amp; tasks</h2>
        {notes.length > 0 && (
          <span className="text-xs text-text-muted">
            {openTasks} open · {notes.length} total
          </span>
        )}
      </div>

      {notes.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1.5">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-bg-subtle">
              <input
                type="checkbox"
                checked={n.done}
                onChange={() =>
                  run(() =>
                    api(`/manage/projects/${projectId}/notes/${n.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ done: !n.done }),
                    }),
                  )
                }
                className="mt-1"
                aria-label={n.done ? "Mark as not done" : "Mark as done"}
              />
              <span className={`flex-1 whitespace-pre-wrap text-sm ${n.done ? "text-text-muted line-through" : ""}`}>
                {n.body}
              </span>
              <button
                onClick={() => run(() => api(`/manage/projects/${projectId}/notes/${n.id}`, { method: "DELETE" }))}
                disabled={busy}
                className="shrink-0 rounded px-1.5 text-xs text-text-muted hover:text-red-600 disabled:opacity-50"
                aria-label="Delete note"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add();
          }}
          placeholder="Add a note or task… (⌘/Ctrl-Enter to add)"
          rows={2}
          className="input flex-1"
        />
        <button onClick={add} disabled={busy || !body.trim()} className="btn-accent">
          Add
        </button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- Edit details ---- */

function EditDetails({
  project,
  busy,
  run,
}: {
  project: ManagedProject;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [tags, setTags] = useState(project.tags.join(", "));

  const save = () =>
    run(() =>
      api(`/manage/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      }),
    );

  const remove = () => {
    if (!confirm(`Delete project "${project.name}" and all its data?`)) return;
    void run(async () => {
      await api(`/manage/projects/${project.id}`, { method: "DELETE" });
      window.location.href = "/manage";
    });
  };

  return (
    <details className="card mb-6 p-5">
      <summary className="cursor-pointer select-none text-base font-semibold">Edit details</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-text-muted">
          Name
          <input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-text-muted">
          Tags <span className="font-normal text-text-muted/60">(comma separated)</span>
          <input className="input mt-1 w-full" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="client, prod" />
        </label>
        <label className="text-xs font-medium text-text-muted sm:col-span-2">
          Description
          <textarea
            className="input mt-1 w-full"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project?"
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-text-muted">
        Costs (purchase &amp; renewal) live on each domain — edit them in the Domains section above.
      </p>
      <div className="mt-4 flex gap-2">
        <button onClick={save} disabled={busy} className="btn-accent">Save changes</button>
        <button onClick={remove} disabled={busy} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
          Delete project
        </button>
      </div>
    </details>
  );
}

/* ---------------------------------------------------------- Connectors ----- */

function ConnectorsPanel({
  project,
  catalog,
  busy,
  run,
}: {
  project: ManagedProject;
  catalog: CatalogItem[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [connId, setConnId] = useState(catalog[0]?.id ?? "");
  const [configText, setConfigText] = useState("");
  const [secretsText, setSecretsText] = useState("");
  const selected = catalog.find((c) => c.id === connId);

  const add = () =>
    run(async () => {
      let config: Record<string, unknown> = {};
      let secrets: Record<string, string> = {};
      if (configText.trim()) config = JSON.parse(configText) as Record<string, unknown>;
      if (secretsText.trim()) secrets = JSON.parse(secretsText) as Record<string, string>;
      await api(`/manage/projects/${project.id}/connectors`, {
        method: "POST",
        body: JSON.stringify({ connectorId: connId, config, secrets }),
      });
      setConfigText("");
      setSecretsText("");
    });

  return (
    <details className="card mb-6 p-5">
      <summary className="cursor-pointer select-none text-base font-semibold">
        Connectors <span className="font-normal text-text-muted">({project.connectors.length})</span>
      </summary>

      <div className="mt-4">
        {project.connectors.length === 0 ? (
          <p className="mb-3 text-sm text-text-muted">No connectors yet.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {project.connectors.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        c.lastSyncStatus === "ok"
                          ? "bg-accent"
                          : c.lastSyncStatus === "error"
                            ? "bg-red-500"
                            : "bg-border"
                      }`}
                    />
                    <span className="font-medium">{c.connectorId}</span>
                    {!c.enabled && <span className="text-xs text-text-muted">(disabled)</span>}
                  </span>
                  <span className="flex gap-2">
                    <button
                      onClick={() =>
                        run(() =>
                          api(`/manage/projects/${project.id}/connectors/${c.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ enabled: !c.enabled }),
                          }),
                        )
                      }
                      disabled={busy}
                      className="rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
                    >
                      {c.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm(`Remove connector "${c.connectorId}"?`)) return;
                        void run(() =>
                          api(`/manage/projects/${project.id}/connectors/${c.id}`, { method: "DELETE" }),
                        );
                      }}
                      disabled={busy}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </span>
                </div>

                {c.actions.length > 0 && (
                  <div className="mt-2 border-t border-border/70 pt-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Actions</div>
                    <ul className="flex flex-col gap-1">
                      {c.actions.map((a) => {
                        const granted = c.enabledActions.includes(a.id);
                        return (
                          <li key={a.id} className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-xs" title={a.description}>
                              <input
                                type="checkbox"
                                checked={granted}
                                onChange={() => {
                                  const next = granted
                                    ? c.enabledActions.filter((x) => x !== a.id)
                                    : [...c.enabledActions, a.id];
                                  void run(() =>
                                    api(`/manage/projects/${project.id}/connectors/${c.id}/actions`, {
                                      method: "PATCH",
                                      body: JSON.stringify({ actionIds: next }),
                                    }),
                                  );
                                }}
                              />
                              {a.title}
                              {a.destructive && <span className="text-red-600">⚠</span>}
                            </label>
                            <button
                              disabled={busy || !granted}
                              onClick={() => {
                                if (a.destructive && !confirm(`Run "${a.title}"? This is a real, possibly irreversible action.`)) return;
                                void run(async () => {
                                  const res = (await api(
                                    `/manage/projects/${project.id}/connectors/${c.id}/actions/${a.id}`,
                                    { method: "POST", body: JSON.stringify({}) },
                                  )) as { ok: boolean; message?: string };
                                  alert(res.ok ? `✓ ${res.message ?? "done"}` : `✗ ${res.message ?? "failed"}`);
                                });
                              }}
                              className="rounded border border-accent/40 px-2 py-0.5 text-xs text-accent-strong hover:bg-accent/10 disabled:opacity-40"
                              title={granted ? "Run action" : "Enable the action first"}
                            >
                              Run
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select className="input" value={connId} onChange={(e) => setConnId(e.target.value)}>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.category} · {c.title}
                  {c.authKind !== "none" ? ` · ${c.authKind}` : ""}
                  {c.actions.length ? ` · ${c.actions.length} action${c.actions.length === 1 ? "" : "s"}` : ""}
                  {c.verified ? " · ✓" : ""}
                </option>
              ))}
            </select>
            <button onClick={add} disabled={busy || !connId} className="btn-accent">
              Add / update
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <textarea
              className="input font-mono text-xs"
              rows={2}
              placeholder='Config JSON (optional), e.g. {"url":"https://blog.com"}'
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
            />
            <textarea
              className="input font-mono text-xs"
              rows={2}
              placeholder={
                selected?.requiresSecrets
                  ? 'Secrets JSON, e.g. {"apiKey":"..."} (encrypted at rest)'
                  : "Secrets JSON (not needed for this connector)"
              }
              value={secretsText}
              onChange={(e) => setSecretsText(e.target.value)}
            />
          </div>
        </div>
      </div>
    </details>
  );
}

/* --------------------------------------------------------- Alert rules ----- */

function AlertRulesPanel({
  projectId,
  rules,
  run,
}: {
  projectId: string;
  rules: AlertRule[];
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [metric, setMetric] = useState("ssl.days_until_expiry");
  const [op, setOp] = useState("lt");
  const [threshold, setThreshold] = useState("14");

  const add = () =>
    run(() =>
      api(`/manage/projects/${projectId}/alert-rules`, {
        method: "POST",
        body: JSON.stringify({ metricName: metric.trim(), operator: op, threshold: Number(threshold) }),
      }),
    );

  return (
    <section className="card p-4 sm:col-span-2">
      <h2 className="mb-3 text-sm font-semibold">Alert rules</h2>
      {rules.length === 0 ? (
        <p className="mb-3 text-sm text-text-muted">No alert rules yet.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm">
              <span>
                <code className="text-xs">{r.metricName}</code>{" "}
                {OPERATOR_LABELS[r.operator] ?? r.operator} {r.threshold}
                <span className="ml-2 text-xs text-text-muted">({r.severity})</span>
              </span>
              <button
                onClick={() => run(() => api(`/manage/projects/${projectId}/alert-rules/${r.id}`, { method: "DELETE" }))}
                className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
        <input
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          placeholder="metric name"
          className="input min-w-[10rem] flex-1 font-mono text-xs"
        />
        <select value={op} onChange={(e) => setOp(e.target.value)} className="input text-xs">
          {Object.entries(OPERATOR_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          type="number"
          className="input w-24 text-xs"
        />
        <button onClick={add} disabled={!metric.trim()} className="btn-accent">
          Add rule
        </button>
      </div>
    </section>
  );
}
