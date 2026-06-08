"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRequireAuth, logout, API_BASE as API_URL } from "../lib/auth";

type ProjectStatus =
  | "idea"
  | "in_progress"
  | "rebuild"
  | "live"
  | "paused"
  | "archived";

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
}

interface ProjectInsight {
  projectId: string;
  summary: string | null;
}

/** Columns in display order with labels and accent colors. */
const COLUMNS: { status: ProjectStatus; label: string; accent: string }[] = [
  { status: "idea", label: "💡 Idea", accent: "border-t-slate-300" },
  { status: "in_progress", label: "🚧 In progress", accent: "border-t-amber-400" },
  { status: "rebuild", label: "🔧 Rebuild", accent: "border-t-orange-400" },
  { status: "live", label: "✅ Live", accent: "border-t-accent" },
  { status: "paused", label: "⏸ Paused", accent: "border-t-slate-400" },
  { status: "archived", label: "📦 Archived", accent: "border-t-slate-300" },
];

const HEALTH_META: Record<
  ProjectSummary["health"],
  { label: string; cls: string }
> = {
  healthy: { label: "Healthy", cls: "bg-accent/15 text-accent-strong" },
  degraded: { label: "Degraded", cls: "bg-amber-100 text-amber-700" },
  down: { label: "Down", cls: "bg-red-100 text-red-700" },
  unknown: { label: "Unknown", cls: "bg-bg-subtle text-text-muted" },
};

export default function DashboardPage() {
  useRequireAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [insights, setInsights] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [pRes, iRes] = await Promise.all([
        fetch(`${API_URL}/api/projects`, { cache: "no-store", credentials: "include" }),
        fetch(`${API_URL}/api/insights`, { cache: "no-store", credentials: "include" }),
      ]);
      if (!pRes.ok) throw new Error(`API ${pRes.status}`);
      setProjects((await pRes.json()) as ProjectSummary[]);
      if (iRes.ok) {
        const rows = (await iRes.json()) as ProjectInsight[];
        setInsights(
          new Map(rows.filter((r) => r.summary).map((r) => [r.projectId, r.summary!])),
        );
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

  async function changeStatus(id: string, status: ProjectStatus) {
    // Optimistic update, then persist.
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await fetch(`${API_URL}/api/manage/projects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
    } catch {
      void reload();
    }
  }

  const allTags = useMemo(
    () => Array.from(new Set(projects.flatMap((p) => p.tags))).sort((a, b) => a.localeCompare(b)),
    [projects],
  );

  const visible = activeTag
    ? projects.filter((p) => p.tags.includes(activeTag))
    : projects;

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Portfolio</h1>
          <p className="mt-1 text-text-muted">
            All your projects across their lifecycle. Change status from the card.
          </p>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <a href="/manage" className="text-accent-strong hover:underline">Manage</a>
          <a href="/sla" className="text-accent-strong hover:underline">SLA report</a>
          <a href="/settings" className="text-accent-strong hover:underline">Settings</a>
          <button onClick={() => void logout()} className="text-text-muted hover:underline">
            Logout
          </button>
        </nav>
      </header>

      {allTags.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">Filter by tag:</span>
          <button
            onClick={() => setActiveTag(null)}
            className={`rounded-full border px-3 py-1 text-xs ${
              activeTag ? "border-border bg-surface text-text-muted" : "border-accent bg-accent text-accent-ink"
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`rounded-full border px-3 py-1 text-xs ${
                activeTag === tag
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-text-muted hover:border-accent"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          Could not reach the API at <code>{API_URL}</code>. Is the stack running? ({error})
        </div>
      ) : loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {COLUMNS.map((col) => {
            const inCol = visible.filter((p) => p.status === col.status);
            return (
              <section key={col.status} className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-xs text-text-muted">
                    {inCol.length}
                  </span>
                </div>
                {inCol.length === 0 ? (
                  <p className="px-1 text-xs text-text-muted/60">—</p>
                ) : (
                  inCol.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      insight={insights.get(p.id)}
                      accent={col.accent}
                      onStatus={changeStatus}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function ProjectCard({
  project,
  insight,
  accent,
  onStatus,
}: {
  project: ProjectSummary;
  insight: string | undefined;
  accent: string;
  onStatus: (id: string, status: ProjectStatus) => void;
}) {
  const isLive = project.status === "live" || project.status === "rebuild";
  const ssl = project.metrics.find((m) => m.name === "ssl.days_until_expiry");

  return (
    <article
      className={`flex flex-col gap-3 rounded-xl border border-t-4 border-border bg-surface p-4 shadow-sm ${accent}`}
    >
      <div>
        <a href={`/projects/${project.id}`} className="font-semibold hover:underline">
          {project.name}
        </a>
        {project.domain ? (
          <p className="font-mono text-xs text-text-muted">{project.domain}</p>
        ) : (
          <p className="text-xs italic text-text-muted/70">no domain yet</p>
        )}
      </div>

      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {project.tags.map((t) => (
            <span key={t} className="rounded-full bg-bg-subtle px-2 py-0.5 text-[10px] text-text-muted">
              {t}
            </span>
          ))}
        </div>
      )}

      {isLive && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${(HEALTH_META[project.health] ?? HEALTH_META.unknown).cls}`}>
            {(HEALTH_META[project.health] ?? HEALTH_META.unknown).label}
          </span>
          {ssl && (
            <span className="text-[11px] text-text-muted">SSL {ssl.value}d</span>
          )}
          {project.connectors.length > 0 && (
            <span className="text-[11px] text-text-muted">
              {project.connectors.length} connector{project.connectors.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {insight && (
        <p className="line-clamp-3 rounded-md border border-accent/30 bg-accent/5 p-2 text-[11px] text-text">
          ✦ {insight}
        </p>
      )}

      <select
        value={project.status}
        onChange={(e) => onStatus(project.id, e.target.value as ProjectStatus)}
        className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-muted"
      >
        {COLUMNS.map((c) => (
          <option key={c.status} value={c.status}>
            Move to: {c.label.replace(/^\S+\s/, "")}
          </option>
        ))}
      </select>
    </article>
  );
}
