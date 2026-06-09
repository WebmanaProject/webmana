"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRequireAuth, API_BASE as API_URL } from "../lib/auth";
import { Header } from "../components/Header";

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
  renewalCost: number | null;
  costCurrency: string | null;
  tags: string[];
  health: "healthy" | "degraded" | "down" | "unknown";
  connectors: ProjectConnector[];
  metrics: ProjectMetric[];
}

interface ProjectInsight {
  projectId: string;
  summary: string | null;
}

interface Column {
  status: ProjectStatus;
  label: string;
  dot: string;
  bar: string;
}

/** Columns in lifecycle order. `dot` = header marker, `bar` = card top accent. */
const COLUMNS: Column[] = [
  { status: "idea", label: "Idea", dot: "bg-slate-300", bar: "before:bg-slate-300" },
  { status: "in_progress", label: "In progress", dot: "bg-amber-400", bar: "before:bg-amber-400" },
  { status: "rebuild", label: "Rebuild", dot: "bg-orange-400", bar: "before:bg-orange-400" },
  { status: "live", label: "Live", dot: "bg-accent", bar: "before:bg-accent" },
  { status: "paused", label: "Paused", dot: "bg-slate-400", bar: "before:bg-slate-400" },
  { status: "archived", label: "Archived", dot: "bg-slate-300", bar: "before:bg-slate-300" },
];

const HEALTH_META: Record<
  ProjectSummary["health"],
  { label: string; cls: string; dot: string }
> = {
  healthy: { label: "Healthy", cls: "bg-accent/15 text-accent-strong", dot: "bg-accent" },
  degraded: { label: "Degraded", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
  down: { label: "Down", cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
  unknown: { label: "—", cls: "bg-bg-subtle text-text-muted", dot: "bg-slate-300" },
};

const STATUS_OPTIONS = COLUMNS.map((c) => ({ value: c.status, label: c.label }));

export default function DashboardPage() {
  useRequireAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [insights, setInsights] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ProjectStatus | null>(null);
  const [showAdd, setShowAdd] = useState(false);

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

  const changeStatus = useCallback(
    async (id: string, status: ProjectStatus) => {
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
    },
    [reload],
  );

  function onDrop(status: ProjectStatus) {
    setDragOver(null);
    const id = dragId;
    setDragId(null);
    if (id) {
      const cur = projects.find((p) => p.id === id);
      if (cur && cur.status !== status) void changeStatus(id, status);
    }
  }

  const allTags = useMemo(
    () => Array.from(new Set(projects.flatMap((p) => p.tags))).sort((a, b) => a.localeCompare(b)),
    [projects],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (activeTag && !p.tags.includes(activeTag)) return false;
      if (q && !(`${p.name} ${p.domain ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [projects, activeTag, query]);

  return (
    <>
      <Header
        links={[
          { href: "/domains", label: "Domains" },
          { href: "/manage", label: "Manage" },
          { href: "/sla", label: "SLA" },
          { href: "/settings", label: "Settings" },
        ]}
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-accent mr-1">
            + New project
          </button>
        }
      />
      <main className="mx-auto max-w-[1600px] px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {projects.length} project{projects.length === 1 ? "" : "s"} · drag a card between columns to change its stage
        </p>
      </div>

      {/* Toolbar: search + tag filter */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or domain…"
            className="w-64 rounded-lg border border-border bg-surface py-2 pl-8 pr-3 text-sm focus:border-accent"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                activeTag ? "border-border bg-surface text-text-muted hover:border-accent" : "border-accent bg-accent text-accent-ink"
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
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
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          Could not reach the API at <code>{API_URL}</code>. Is the stack running? ({error})
        </div>
      ) : loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {COLUMNS.map((col) => {
            const inCol = visible.filter((p) => p.status === col.status);
            const isOver = dragOver === col.status;
            return (
              <section
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOver !== col.status) setDragOver(col.status);
                }}
                onDragLeave={(e) => {
                  // Only clear when leaving the column entirely.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
                }}
                onDrop={() => onDrop(col.status)}
                className={`flex max-h-[calc(100vh-220px)] flex-col rounded-xl border p-2 transition ${
                  isOver ? "border-accent bg-accent/5" : "border-border/70 bg-bg-subtle/40"
                }`}
              >
                <div className="mb-2 flex items-center justify-between px-1.5 py-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{col.label}</h2>
                  </div>
                  <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-medium text-text-muted shadow-sm">
                    {inCol.length}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-0.5 pb-1">
                  {inCol.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 py-6 text-[11px] text-text-muted/50">
                      Drop here
                    </div>
                  ) : (
                    inCol.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        insight={insights.get(p.id)}
                        column={col}
                        dragging={dragId === p.id}
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOver(null);
                        }}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddProjectModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            void reload();
          }}
        />
      )}
      </main>
    </>
  );
}

function ProjectCard({
  project,
  insight,
  column,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  project: ProjectSummary;
  insight: string | undefined;
  column: Column;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const isLive = project.status === "live" || project.status === "rebuild";
  const ssl = project.metrics.find((m) => m.name === "ssl.days_until_expiry");
  const health = HEALTH_META[project.health] ?? HEALTH_META.unknown;

  // Distinguish a click (navigate) from a drag (reorder).
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  function navigate() {
    window.location.href = `/projects/${project.id}`;
  }

  return (
    <article
      draggable
      onDragStart={(e) => {
        movedRef.current = true;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", project.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onMouseDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
        movedRef.current = false;
      }}
      onMouseUp={(e) => {
        // Treat as a click only if the pointer didn't move much and we're not dragging.
        if (movedRef.current || !downPos.current) return;
        const dx = Math.abs(e.clientX - downPos.current.x);
        const dy = Math.abs(e.clientY - downPos.current.y);
        if (dx < 5 && dy < 5 && !(e.target as HTMLElement).closest("[data-no-nav]")) {
          navigate();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate();
      }}
      tabIndex={0}
      role="link"
      aria-label={`Open ${project.name}`}
      className={`group relative cursor-pointer rounded-lg border border-border bg-surface p-3 shadow-sm transition
        before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-l-lg ${column.bar}
        hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md
        ${dragging ? "rotate-1 opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-tight group-hover:text-accent-strong">
            {project.name}
          </h3>
          {project.domain ? (
            <p className="truncate font-mono text-[11px] text-text-muted">{project.domain}</p>
          ) : (
            <p className="text-[11px] italic text-text-muted/60">no domain yet</p>
          )}
        </div>
        {isLive && (
          <span
            title={health.label}
            className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${health.dot}`}
          />
        )}
      </div>

      {(project.tags.length > 0 || (isLive && (ssl || project.connectors.length > 0))) && (
        <div className="mt-2 flex flex-wrap items-center gap-1 pl-1.5">
          {isLive && ssl && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ssl.value <= 14 ? "bg-amber-100 text-amber-700" : "bg-bg-subtle text-text-muted"}`}>
              SSL {ssl.value}d
            </span>
          )}
          {isLive && project.connectors.length > 0 && (
            <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
              {project.connectors.length} conn
            </span>
          )}
          {project.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-bg-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
              {t}
            </span>
          ))}
          {project.tags.length > 3 && (
            <span className="text-[10px] text-text-muted/60">+{project.tags.length - 3}</span>
          )}
        </div>
      )}

      {insight && (
        <p className="mt-2 line-clamp-2 pl-1.5 text-[11px] leading-snug text-text-muted">
          <span className="text-accent-strong">✦</span> {insight}
        </p>
      )}

      {project.renewalCost != null && (
        <p className="mt-2 pl-1.5 text-[10px] text-text-muted/80">
          ↻ {project.renewalCost}
          {project.costCurrency ? ` ${project.costCurrency}` : ""}/yr
        </p>
      )}
    </article>
  );
}

function AddProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("idea");
  const [tags, setTags] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [renewalCost, setRenewalCost] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/manage/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          domain,
          status,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          purchaseCost: purchaseCost ? Number(purchaseCost) : null,
          renewalCost: renewalCost ? Number(renewalCost) : null,
          costCurrency: currency || null,
          purchaseDate: purchaseDate || null,
        }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
        throw new Error(
          Array.isArray(body.message) ? body.message.join(", ") : body.message ?? `Failed (${res.status})`,
        );
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-card-hover animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New project</h2>
          <button onClick={onClose} className="rounded-md px-2 text-text-muted hover:bg-bg-subtle" aria-label="Close">✕</button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-xs font-medium text-text-muted">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Blog"
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent"
              required
            />
          </label>
          <label className="text-xs font-medium text-text-muted">
            Domain <span className="font-normal text-text-muted/60">(optional)</span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="blog.com"
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm focus:border-accent"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-text-muted">
              Stage
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-text-muted">
              Tags
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="client, prod"
                className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent"
              />
            </label>
          </div>

          <details className="rounded-lg border border-border bg-bg-subtle/50 px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none font-medium text-text-muted">
              Domain costs (optional)
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="font-medium text-text-muted">
                Purchase cost
                <input type="number" step="0.01" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="12.00" className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent" />
              </label>
              <label className="font-medium text-text-muted">
                Renewal / yr
                <input type="number" step="0.01" value={renewalCost} onChange={(e) => setRenewalCost(e.target.value)} placeholder="14.00" className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent" />
              </label>
              <label className="font-medium text-text-muted">
                Currency
                <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" maxLength={3} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm uppercase focus:border-accent" />
              </label>
              <label className="font-medium text-text-muted">
                Purchase date
                <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent" />
              </label>
            </div>
          </details>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-bg-subtle">
              Cancel
            </button>
            <button type="submit" disabled={busy || !name.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">
              {busy ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
