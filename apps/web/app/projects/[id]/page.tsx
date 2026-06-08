"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAuth, API_BASE as API_URL } from "../../lib/auth";

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

interface ProjectMetric {
  connectorId: string;
  kind: string;
  name: string;
  value: number;
  unit: string | null;
}

interface ProjectConnector {
  connectorId: string;
  lastSyncStatus: string | null;
  lastSyncAt: string | null;
}

interface ProjectEvent {
  severity: string;
  title: string;
  description: string | null;
  occurredAt: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  domain: string | null;
  status: ProjectStatus;
  description: string | null;
  links: Record<string, string>;
  tags: string[];
  health: "healthy" | "degraded" | "down" | "unknown";
  connectors: ProjectConnector[];
  metrics: ProjectMetric[];
  events: ProjectEvent[];
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

const OPERATOR_LABELS: Record<string, string> = {
  lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=",
};

const HEALTH_META: Record<string, { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "bg-accent/15 text-accent-strong" },
  degraded: { label: "Degraded", cls: "bg-amber-100 text-amber-700" },
  down: { label: "Down", cls: "bg-red-100 text-red-700" },
  unknown: { label: "Unknown", cls: "bg-bg-subtle text-text-muted" },
};

function healthMeta(h: string): { label: string; cls: string } {
  return HEALTH_META[h] ?? HEALTH_META.unknown!;
}

function severityClass(severity: string): string {
  if (severity === "critical") return "bg-red-50 text-red-700 border-red-200";
  if (severity === "warning") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-bg-subtle text-text-muted border-border";
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  useRequireAuth();
  const [id, setId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [sla, setSla] = useState<SlaRow | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rules, setRules] = useState<AlertRule[]>([]);

  // New-rule form
  const [rMetric, setRMetric] = useState("ssl.days_until_expiry");
  const [rOp, setROp] = useState("lt");
  const [rThreshold, setRThreshold] = useState("14");

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const [pRes, sRes, iRes] = await Promise.all([
        fetch(`${API_URL}/api/projects`, { cache: "no-store", credentials: "include" }),
        fetch(`${API_URL}/api/sla?projectId=${id}`, { cache: "no-store", credentials: "include" }),
        fetch(`${API_URL}/api/insights?projectId=${id}`, { cache: "no-store", credentials: "include" }),
      ]);
      const all = pRes.ok ? ((await pRes.json()) as ProjectSummary[]) : [];
      const found = all.find((p) => p.id === id) ?? null;
      setProject(found);
      setNotFound(!found);
      if (sRes.ok) {
        const body = (await sRes.json()) as { projects: SlaRow[] };
        setSla(body.projects.find((r) => r.projectId === id) ?? null);
      }
      if (iRes.ok) {
        const rows = (await iRes.json()) as { projectId: string; summary: string | null }[];
        setInsight(rows.find((r) => r.projectId === id)?.summary ?? null);
      }
      const rRes = await fetch(`${API_URL}/api/manage/projects/${id}/alert-rules`, {
        cache: "no-store",
        credentials: "include",
      });
      if (rRes.ok) setRules((await rRes.json()) as AlertRule[]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  async function addRule() {
    if (!project) return;
    await fetch(`${API_URL}/api/manage/projects/${project.id}/alert-rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        metricName: rMetric.trim(),
        operator: rOp,
        threshold: Number(rThreshold),
      }),
    });
    void reload();
  }

  async function deleteRule(ruleId: string) {
    if (!project) return;
    await fetch(`${API_URL}/api/manage/projects/${project.id}/alert-rules/${ruleId}`, {
      method: "DELETE",
      credentials: "include",
    });
    void reload();
  }

  useEffect(() => {
    void reload();
  }, [reload]);

  async function changeStatus(status: ProjectStatus) {
    if (!project) return;
    setProject({ ...project, status });
    await fetch(`${API_URL}/api/manage/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
  }

  if (loading) return <main className="mx-auto max-w-4xl px-6 py-12 text-text-muted">Loading…</main>;
  if (notFound || !project)
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-text-muted">Project not found.</p>
        <a href="/dashboard" className="text-accent-strong hover:underline">← Back to portfolio</a>
      </main>
    );

  const isLive = project.status === "live" || project.status === "rebuild";
  const linkEntries = Object.entries(project.links ?? {}).filter(([, v]) => v);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          {project.domain ? (
            <p className="mt-1 font-mono text-sm text-text-muted">{project.domain}</p>
          ) : (
            <p className="mt-1 text-sm italic text-text-muted/70">no domain yet</p>
          )}
        </div>
        <a href="/dashboard" className="text-sm text-accent-strong hover:underline">← Portfolio</a>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="text-sm text-text-muted">Status:</label>
        <select
          value={project.status}
          onChange={(e) => changeStatus(e.target.value as ProjectStatus)}
          className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {isLive && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthMeta(project.health).cls}`}>
            {healthMeta(project.health).label}
          </span>
        )}
        {project.tags.map((t) => (
          <span key={t} className="rounded-full bg-bg-subtle px-2 py-0.5 text-xs text-text-muted">{t}</span>
        ))}
      </div>

      {project.description && (
        <p className="mb-6 rounded-xl border border-border bg-surface p-4 text-sm">{project.description}</p>
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
        <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="mb-1 text-xs font-medium text-accent-strong">✦ AI summary</div>
          <p className="text-sm">{insight}</p>
        </div>
      )}

      {!isLive ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-subtle p-6 text-center text-sm text-text-muted">
          This project is not live yet — monitoring starts once its status is{" "}
          <span className="font-medium">Live</span> or <span className="font-medium">Rebuild</span> and it has a domain.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {/* SLA */}
          <section className="rounded-xl border border-border bg-surface p-4">
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

          {/* Connectors */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Connectors</h2>
            {project.connectors.length === 0 ? (
              <p className="text-sm text-text-muted">None.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {project.connectors.map((c) => (
                  <li key={c.connectorId} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${c.lastSyncStatus === "ok" ? "bg-accent" : c.lastSyncStatus === "error" ? "bg-red-500" : "bg-border"}`} />
                    {c.connectorId}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Metrics */}
          <section className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
            <h2 className="mb-3 text-sm font-semibold">Latest metrics</h2>
            {project.metrics.length === 0 ? (
              <p className="text-sm text-text-muted">No metrics yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {project.metrics.map((m) => (
                  <div key={m.name} className="flex justify-between text-sm">
                    <span className="text-text-muted">{m.name}</span>
                    <span className="font-medium">{m.value}{m.unit ? ` ${m.unit}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Alert rules */}
          <section className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
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
                      onClick={() => void deleteRule(r.id)}
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
                value={rMetric}
                onChange={(e) => setRMetric(e.target.value)}
                placeholder="metric name"
                className="flex-1 rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs"
              />
              <select value={rOp} onChange={(e) => setROp(e.target.value)} className="rounded-md border border-border bg-bg px-2 py-1 text-xs">
                {Object.entries(OPERATOR_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input
                value={rThreshold}
                onChange={(e) => setRThreshold(e.target.value)}
                type="number"
                className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-xs"
              />
              <button
                onClick={() => void addRule()}
                disabled={!rMetric.trim()}
                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-ink disabled:opacity-50"
              >
                Add rule
              </button>
            </div>
          </section>

          {/* Recent events */}
          {project.events.length > 0 && (
            <section className="sm:col-span-2">
              <h2 className="mb-2 text-sm font-semibold">Recent events</h2>
              <ul className="flex flex-col gap-2">
                {project.events.slice(0, 8).map((e, i) => (
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
