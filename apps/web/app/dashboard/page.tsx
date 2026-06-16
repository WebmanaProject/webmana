"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRequireAuth, API_BASE as API_URL } from "../lib/auth";
import { StatTile, Badge } from "../components/ui";

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
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Portfolio</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {projects.length} project{projects.length === 1 ? "" : "s"} · drag a card between columns to change its stage
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-accent shrink-0">
          + New project
        </button>
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

      {!error && !loading && projects.length > 0 && <PortfolioOverview projects={projects} />}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          Could not reach the API at <code>{API_URL}</code>. Is the stack running? ({error})
        </div>
      ) : loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : projects.length === 0 ? (
        <OnboardingHero onStart={() => setShowAdd(true)} />
      ) : (
        <div className="flex flex-col gap-3 lg:flex-row lg:overflow-x-auto lg:pb-2">
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
                className={`flex flex-col rounded-xl border p-2 transition lg:max-h-[calc(100vh-200px)] lg:w-[17rem] lg:shrink-0 ${
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
                        onStatusChange={(s) => void changeStatus(p.id, s)}
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
  );
}

/* ------------------------------------------------------ Portfolio Overview - */

interface CurrencyTotal {
  currency: string;
  total: number;
}
interface UpcomingRenewal {
  domainId: string;
  fqdn: string;
  daysUntil: number;
  autoRenew: boolean;
}
interface FinanceLite {
  annualByCurrency: CurrencyTotal[];
  cloudByCurrency: CurrencyTotal[];
  mrrByCurrency: CurrencyTotal[];
  upcomingRenewals: UpcomingRenewal[];
}

interface Risk {
  id: string;
  severity: "critical" | "warning";
  label: string;
  href: string;
}

const fmtMoney = (totals: CurrencyTotal[]) =>
  totals.length === 0
    ? "—"
    : totals.map((c) => `${c.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${c.currency}`).join(" + ");

interface ActiveIncident {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved";
}

/** Portfolio-level intelligence band: health, spend, and a risk queue. */
function PortfolioOverview({ projects }: { projects: ProjectSummary[] }) {
  const [finance, setFinance] = useState<FinanceLite | null>(null);
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/finance`, { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFinance(d as FinanceLite | null))
      .catch(() => setFinance(null));
    fetch(`${API_URL}/api/incidents`, { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setIncidents(Array.isArray(d) ? (d as ActiveIncident[]) : []))
      .catch(() => setIncidents([]));
  }, []);

  const live = projects.filter((p) => p.status === "live" || p.status === "rebuild");
  const counts = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
  for (const p of live) counts[p.health] += 1;

  // Roll up risks from project + finance + incident signals.
  const risks: Risk[] = [];
  for (const inc of incidents) {
    if (inc.status === "resolved") continue;
    risks.push({
      id: `inc-${inc.id}`,
      severity: inc.severity === "critical" ? "critical" : "warning",
      label: `Incident: ${inc.title} (${inc.status})`,
      href: "/incidents",
    });
  }
  for (const p of projects) {
    if (p.health === "down") risks.push({ id: `down-${p.id}`, severity: "critical", label: `${p.name} is down`, href: `/projects/${p.id}` });
    else if (p.health === "degraded") risks.push({ id: `deg-${p.id}`, severity: "warning", label: `${p.name} is degraded`, href: `/projects/${p.id}` });
    const ssl = p.metrics.find((m) => m.name === "ssl.days_until_expiry");
    if (ssl && ssl.value <= 14) {
      risks.push({
        id: `ssl-${p.id}`,
        severity: ssl.value <= 3 ? "critical" : "warning",
        label: `${p.name}: SSL expires in ${ssl.value}d`,
        href: `/projects/${p.id}`,
      });
    }
    if ((p.status === "live" || p.status === "rebuild") && p.connectors.length === 0) {
      risks.push({ id: `mon-${p.id}`, severity: "warning", label: `${p.name} is live but not monitored`, href: `/projects/${p.id}` });
    }
  }
  for (const r of finance?.upcomingRenewals ?? []) {
    if (r.daysUntil <= 30 && !r.autoRenew) {
      risks.push({
        id: `dom-${r.domainId}`,
        severity: r.daysUntil <= 7 ? "critical" : "warning",
        label: `${r.fqdn} renews in ${r.daysUntil}d (no auto-renew)`,
        href: "/finance",
      });
    }
  }
  risks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-4 lg:col-span-2">
        <StatTile label="Projects" value={projects.length} hint={`${live.length} live`} />
        <StatTile
          label="Live health"
          value={`${counts.healthy}/${live.length || 0}`}
          hint={`${counts.degraded} degraded · ${counts.down} down`}
          trend={counts.down > 0 ? "down" : counts.degraded > 0 ? "flat" : "up"}
        />
        <StatTile label="MRR" value={fmtMoney(finance?.mrrByCurrency ?? [])} hint="monthly recurring revenue" trend={(finance?.mrrByCurrency?.length ?? 0) > 0 ? "up" : undefined} />
        <StatTile label="Annual renewals" value={fmtMoney(finance?.annualByCurrency ?? [])} hint="domains, per year" />
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          {risks.length > 0 && <Badge tone={risks.some((r) => r.severity === "critical") ? "red" : "amber"}>{risks.length}</Badge>}
        </div>
        {risks.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <span className="h-2 w-2 rounded-full bg-accent" /> All clear — nothing needs attention.
          </p>
        ) : (
          <ul className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
            {risks.slice(0, 12).map((r) => (
              <li key={r.id}>
                <a href={r.href} className="flex items-start gap-2 rounded-lg px-1 py-1 text-sm hover:bg-bg-subtle">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${r.severity === "critical" ? "bg-red-500" : "bg-amber-400"}`} />
                  <span className="flex-1">{r.label}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** First-run welcome shown on an empty portfolio. */
function OnboardingHero({ onStart }: { onStart: () => void }) {
  const steps = [
    { title: "Create a project", body: "Every site, app, or domain you own starts as a project on the board." },
    { title: "Assign its domain(s)", body: "Attach one or more domains and record registrar, expiry, and renewal cost." },
    { title: "Connect monitoring", body: "Add a keyless connector (SSL, DNS, uptime) — data flows in automatically." },
  ];
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-8 shadow-card">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-strong">
        Welcome to Webmana
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Set up your portfolio in three steps</h2>
      <p className="mt-1 text-sm text-text-muted">
        Webmana keeps every domain and project you run in one control room. Let’s add your first one.
      </p>
      <ol className="mt-6 flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent-strong">
              {i + 1}
            </span>
            <div>
              <div className="text-sm font-medium">{s.title}</div>
              <p className="text-sm text-text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <button onClick={onStart} className="btn-accent mt-6">
        + Create your first project
      </button>
    </div>
  );
}

function ProjectCard({
  project,
  insight,
  column,
  dragging,
  onStatusChange,
  onDragStart,
  onDragEnd,
}: {
  project: ProjectSummary;
  insight: string | undefined;
  column: Column;
  dragging: boolean;
  onStatusChange: (status: ProjectStatus) => void;
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

      <div
        data-no-nav
        className="mt-2 flex items-center justify-between gap-2 pl-1.5"
      >
        <select
          value={project.status}
          aria-label="Change stage"
          title="Change stage"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onStatusChange(e.target.value as ProjectStatus)}
          className="-ml-0.5 cursor-pointer rounded border border-transparent bg-transparent py-0.5 pl-1 pr-5 text-[10px] text-text-muted/70 transition hover:border-border hover:text-text focus:border-accent focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {project.renewalCost != null && (
          <span className="shrink-0 text-[10px] text-text-muted/80">
            ↻ {project.renewalCost}
            {project.costCurrency ? ` ${project.costCurrency}` : ""}/yr
          </span>
        )}
      </div>
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

          <p className="text-xs text-text-muted">
            Tip: assign domains and set their purchase / renewal costs from the project page after
            creating it.
          </p>

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
