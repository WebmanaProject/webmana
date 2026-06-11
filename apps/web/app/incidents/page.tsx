"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRequireAuth, API_BASE as API_URL } from "../lib/auth";
import { Badge, Button, EmptyState, Field, Spinner } from "../components/ui";

type Severity = "info" | "warning" | "critical";
type Status = "open" | "acknowledged" | "resolved";

interface Incident {
  id: string;
  projectId: string | null;
  projectName: string | null;
  title: string;
  description: string | null;
  severity: Severity;
  status: Status;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface ProjectLite {
  id: string;
  name: string;
}

interface MaintWindow {
  id: string;
  projectId: string | null;
  projectName: string | null;
  reason: string | null;
  startsAt: string;
  endsAt: string;
}

const SEV_TONE: Record<Severity, "red" | "amber" | "neutral"> = {
  critical: "red",
  warning: "amber",
  info: "neutral",
};

const STATUS_TONE: Record<Status, "red" | "amber" | "accent"> = {
  open: "red",
  acknowledged: "amber",
  resolved: "accent",
};

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
      const b = (await res.json()) as { message?: string | string[] };
      if (b.message) msg = Array.isArray(b.message) ? b.message.join(", ") : b.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export default function IncidentsPage() {
  useRequireAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [maintenance, setMaintenance] = useState<MaintWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // New-incident form
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<Severity>("warning");
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [inc, projs, maint] = await Promise.all([
        api("/incidents") as Promise<Incident[]>,
        api("/projects").catch(() => []) as Promise<{ id: string; name: string }[]>,
        api("/manage/maintenance").catch(() => []) as Promise<MaintWindow[]>,
      ]);
      setIncidents(inc);
      setProjects(Array.isArray(projs) ? projs.map((p) => ({ id: p.id, name: p.name })) : []);
      setMaintenance(Array.isArray(maint) ? maint : []);
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

  const create = () =>
    run(async () => {
      await api("/incidents", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          severity,
          projectId: projectId || null,
          description: description.trim() || null,
        }),
      });
      setTitle("");
      setDescription("");
      setProjectId("");
      setSeverity("warning");
      setAdding(false);
    });

  const setStatus = (id: string, status: Status) =>
    run(() => api(`/incidents/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }));

  const remove = (id: string) => {
    if (!confirm("Delete this incident?")) return;
    void run(() => api(`/incidents/${id}`, { method: "DELETE" }));
  };

  const activeCount = useMemo(() => incidents.filter((i) => i.status !== "resolved").length, [incidents]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {activeCount} active · {incidents.length} total
          </p>
        </div>
        {!adding && <Button onClick={() => setAdding(true)}>+ New incident</Button>}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {adding && (
        <section className="card mb-6 p-5">
          <h2 className="mb-4 text-base font-semibold">New incident</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="API returning 500s" />
            <label className="block text-xs font-medium text-text-muted">
              Severity
              <select className="input mt-1 w-full" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-text-muted sm:col-span-2">
              Project <span className="font-normal text-text-muted/60">(optional)</span>
              <select className="input mt-1 w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Org-wide</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-text-muted sm:col-span-2">
              Description
              <textarea className="input mt-1 w-full" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened?" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={create} disabled={busy || !title.trim()}>Create incident</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </section>
      )}

      {loading ? (
        <Spinner />
      ) : incidents.length === 0 ? (
        <EmptyState
          title="No incidents"
          description="Nothing's on fire. Open an incident to track an outage or issue through to resolution."
          action={<Button onClick={() => setAdding(true)}>+ New incident</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {incidents.map((i) => (
            <li key={i.id} className={`card p-4 ${i.status === "resolved" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.title}</span>
                    <Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge>
                    <Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {i.projectId ? (
                      <a href={`/projects/${i.projectId}`} className="hover:text-accent-strong">{i.projectName ?? "project"}</a>
                    ) : (
                      "Org-wide"
                    )}
                    {" · opened "}
                    {new Date(i.createdAt).toLocaleString()}
                    {i.resolvedAt && ` · resolved ${new Date(i.resolvedAt).toLocaleString()}`}
                  </div>
                  {i.description && <p className="mt-2 whitespace-pre-wrap text-sm">{i.description}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {i.status === "open" && (
                    <button onClick={() => setStatus(i.id, "acknowledged")} disabled={busy} className="rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50">
                      Acknowledge
                    </button>
                  )}
                  {i.status !== "resolved" && (
                    <button onClick={() => setStatus(i.id, "resolved")} disabled={busy} className="rounded border border-accent/40 px-2 py-1 text-xs text-accent-strong hover:bg-accent/10 disabled:opacity-50">
                      Resolve
                    </button>
                  )}
                  {i.status === "resolved" && (
                    <button onClick={() => setStatus(i.id, "open")} disabled={busy} className="rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50">
                      Reopen
                    </button>
                  )}
                  <button onClick={() => remove(i.id)} disabled={busy} className="rounded px-1.5 text-xs text-text-muted hover:text-red-600 disabled:opacity-50" aria-label="Delete incident">
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MaintenanceSection windows={maintenance} projects={projects} busy={busy} run={run} />
    </main>
  );
}

/* --------------------------------------------------- Maintenance windows --- */

function MaintenanceSection({
  windows,
  projects,
  busy,
  run,
}: {
  windows: MaintWindow[];
  projects: ProjectLite[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState("");
  const [reason, setReason] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const now = Date.now();
  const add = () =>
    run(async () => {
      await api("/manage/maintenance", {
        method: "POST",
        body: JSON.stringify({
          projectId: projectId || null,
          reason: reason.trim() || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      });
      setProjectId("");
      setReason("");
      setStartsAt("");
      setEndsAt("");
    });

  return (
    <section className="mt-10">
      <h2 className="mb-1 text-base font-semibold">Maintenance windows</h2>
      <p className="mb-3 text-sm text-text-muted">Alerts are suppressed for the target while a window is active.</p>

      {windows.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {windows.map((w) => {
            const active = new Date(w.startsAt).getTime() <= now && new Date(w.endsAt).getTime() >= now;
            return (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  {active && <Badge tone="amber">active</Badge>}
                  <span className="font-medium">{w.projectName ?? "Org-wide"}</span>
                  {w.reason && <span className="text-text-muted">· {w.reason}</span>}
                  <span className="text-xs text-text-muted">
                    {new Date(w.startsAt).toLocaleString()} → {new Date(w.endsAt).toLocaleString()}
                  </span>
                </span>
                <button
                  onClick={() => run(() => api(`/manage/maintenance/${w.id}`, { method: "DELETE" }))}
                  disabled={busy}
                  className="rounded px-1.5 text-xs text-text-muted hover:text-red-600 disabled:opacity-50"
                  aria-label="Delete window"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed border-border p-3">
        <label className="text-xs font-medium text-text-muted">
          Target
          <select className="input mt-1 block" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Org-wide</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-text-muted">
          From
          <input className="input mt-1 block" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-text-muted">
          To
          <input className="input mt-1 block" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-text-muted">
          Reason
          <input className="input mt-1 block" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Deploy" />
        </label>
        <Button onClick={add} disabled={busy || !startsAt || !endsAt}>Schedule</Button>
      </div>
    </section>
  );
}
