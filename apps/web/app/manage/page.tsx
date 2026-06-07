"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ?? "http://localhost:4000";

interface ManagedConnector {
  id: string;
  connectorId: string;
  enabled: boolean;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

interface ManagedProject {
  id: string;
  name: string;
  domain: string;
  tags: string[];
  connectors: ManagedConnector[];
}

interface CatalogItem {
  id: string;
  title: string;
  requiresSecrets: boolean;
  defaultIntervalSeconds: number;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
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
  const [projects, setProjects] = useState<ManagedProject[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New-project form state.
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newTags, setNewTags] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [p, c] = await Promise.all([api("/manage/projects"), api("/manage/connectors")]);
      setProjects(p as ManagedProject[]);
      setCatalog(c as CatalogItem[]);
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

  const createProject = () =>
    run(async () => {
      await api("/manage/projects", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          domain: newDomain,
          tags: newTags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      setNewName("");
      setNewDomain("");
      setNewTags("");
    });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Manage</h1>
          <p className="mt-1 text-text-muted">Add and configure projects and connectors.</p>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <a href="/dashboard" className="text-accent-strong hover:underline">
            ← Dashboard
          </a>
        </nav>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* New project */}
      <section className="mb-10 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">New project</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            placeholder="Name (e.g. My Blog)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            placeholder="Domain (e.g. blog.com)"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
          />
          <input
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            placeholder="Tags (comma separated)"
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
          />
        </div>
        <button
          onClick={createProject}
          disabled={busy || !newName.trim() || !newDomain.trim()}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
        >
          Add project
        </button>
      </section>

      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-text-muted">No projects yet — add one above.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              catalog={catalog}
              busy={busy}
              run={run}
              api={api}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function ProjectCard({
  project,
  catalog,
  busy,
  run,
  api,
}: {
  project: ManagedProject;
  catalog: CatalogItem[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  api: (path: string, init?: RequestInit) => Promise<unknown>;
}) {
  const [editName, setEditName] = useState(project.name);
  const [editDomain, setEditDomain] = useState(project.domain);
  const [editTags, setEditTags] = useState(project.tags.join(", "));

  // Add-connector form.
  const [connId, setConnId] = useState(catalog[0]?.id ?? "");
  const [secretsText, setSecretsText] = useState("");
  const [configText, setConfigText] = useState("");

  const selected = catalog.find((c) => c.id === connId);

  const saveProject = () =>
    run(() =>
      api(`/manage/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName,
          domain: editDomain,
          tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      }),
    );

  const deleteProject = () => {
    if (!confirm(`Delete project "${project.name}" and all its data?`)) return;
    void run(() => api(`/manage/projects/${project.id}`, { method: "DELETE" }));
  };

  const addConnector = () =>
    run(async () => {
      let config: Record<string, unknown> = {};
      let secrets: Record<string, string> = {};
      if (configText.trim()) config = JSON.parse(configText) as Record<string, unknown>;
      if (secretsText.trim()) secrets = JSON.parse(secretsText) as Record<string, string>;
      await api(`/manage/projects/${project.id}/connectors`, {
        method: "POST",
        body: JSON.stringify({ connectorId: connId, config, secrets }),
      });
      setSecretsText("");
      setConfigText("");
    });

  return (
    <article className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
        <input
          className="rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm"
          value={editDomain}
          onChange={(e) => setEditDomain(e.target.value)}
        />
        <input
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          placeholder="tags, comma separated"
          value={editTags}
          onChange={(e) => setEditTags(e.target.value)}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={saveProject}
          disabled={busy}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={deleteProject}
          disabled={busy}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete project
        </button>
      </div>

      {/* Connectors */}
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="mb-3 text-sm font-semibold text-text-muted">Connectors</h3>
        {project.connectors.length === 0 ? (
          <p className="mb-3 text-sm text-text-muted">No connectors yet.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {project.connectors.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm"
              >
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
                        api(`/manage/projects/${project.id}/connectors/${c.id}`, {
                          method: "DELETE",
                        }),
                      );
                    }}
                    disabled={busy}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Add connector */}
        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={connId}
              onChange={(e) => setConnId(e.target.value)}
            >
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} {c.requiresSecrets ? "(needs key)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={addConnector}
              disabled={busy || !connId}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
            >
              Add / update
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <textarea
              className="rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs"
              rows={2}
              placeholder='Config JSON (optional), e.g. {"url":"https://blog.com"}'
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
            />
            <textarea
              className="rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs"
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
    </article>
  );
}
