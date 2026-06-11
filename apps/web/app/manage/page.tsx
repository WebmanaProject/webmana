"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRequireAuth, API_BASE as API_URL } from "../lib/auth";
import { EmptyState, Button, Spinner } from "../components/ui";

type ProjectStatus =
  | "idea"
  | "in_progress"
  | "rebuild"
  | "live"
  | "paused"
  | "archived";

const STATUS_META: Record<ProjectStatus, { label: string; cls: string }> = {
  idea: { label: "Idea", cls: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-700" },
  rebuild: { label: "Rebuild", cls: "bg-orange-100 text-orange-700" },
  live: { label: "Live", cls: "bg-accent/15 text-accent-strong" },
  paused: { label: "Paused", cls: "bg-slate-100 text-slate-500" },
  archived: { label: "Archived", cls: "bg-slate-100 text-slate-400" },
};

const STATUS_OPTIONS = (Object.keys(STATUS_META) as ProjectStatus[]).map((value) => ({
  value,
  label: STATUS_META[value].label,
}));

interface ProjectDomain {
  id: string;
  fqdn: string;
  primary: boolean;
}

interface ManagedProject {
  id: string;
  name: string;
  status: ProjectStatus;
  tags: string[];
  domains: ProjectDomain[];
  connectors: { id: string }[];
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
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

export default function ManagePage() {
  useRequireAuth();
  const [projects, setProjects] = useState<ManagedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // New-project form.
  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] = useState<ProjectStatus>("idea");
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const p = (await api("/manage/projects")) as ManagedProject[];
      setProjects(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createProject() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = (await api("/manage/projects", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), status: newStatus }),
      })) as { id: string };
      // Drop straight into the new project to set it up.
      window.location.href = `/projects/${id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...projects].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.domains.some((d) => d.fqdn.toLowerCase().includes(q)) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [projects, query]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manage projects</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {projects.length} project{projects.length === 1 ? "" : "s"} · open one to edit it, assign
            domains, and configure connectors.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* New project */}
      <section className="card mb-6 p-4">
        {adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              className="input min-w-[12rem] flex-1"
              placeholder="Project name (e.g. Acme Marketing Site)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createProject();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <select
              className="input"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as ProjectStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button onClick={createProject} disabled={busy || !newName.trim()} className="btn-accent">
              Create
            </button>
            <button onClick={() => setAdding(false)} className="btn-ghost">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="btn-accent">
            + New project
          </button>
        )}
      </section>

      {/* Search */}
      {projects.length > 0 && (
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            ⌕
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, domain, or tag…"
            className="input w-full py-2 pl-8 pr-3"
          />
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project, then assign its domain(s) and connect monitoring."
          action={<Button onClick={() => setAdding(true)}>+ New project</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" description={`No projects match “${query}”.`} />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {visible.map((p, i) => {
            const status = STATUS_META[p.status];
            const primary = p.domains.find((d) => d.primary) ?? p.domains[0];
            return (
              <li key={p.id} className={i > 0 ? "border-t border-border" : ""}>
                <a
                  href={`/projects/${p.id}`}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-bg-subtle"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium group-hover:text-accent-strong">
                        {p.name}
                      </span>
                      <span className={`badge ${status.cls}`}>{status.label}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
                      {primary ? (
                        <span className="font-mono">
                          {primary.fqdn}
                          {p.domains.length > 1 && (
                            <span className="text-text-muted/70"> +{p.domains.length - 1}</span>
                          )}
                        </span>
                      ) : (
                        <span className="italic text-text-muted/60">no domain</span>
                      )}
                      {p.connectors.length > 0 && <span>· {p.connectors.length} conn</span>}
                      {p.tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded bg-bg-subtle px-1.5 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-strong">
                    →
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
