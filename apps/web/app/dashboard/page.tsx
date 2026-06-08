interface ProjectMetric {
  connectorId: string;
  kind: string;
  name: string;
  value: number;
  unit: string | null;
  labels: Record<string, unknown> | null;
  observedAt: string;
}

interface ProjectConnector {
  connectorId: string;
  lastSyncStatus: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
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
  tags: string[];
  connectors: ProjectConnector[];
  metrics: ProjectMetric[];
  events: ProjectEvent[];
}

interface ProjectInsight {
  projectId: string;
  summary: string | null;
  model: string | null;
  generatedAt: string | null;
}

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function getProjects(tag?: string): Promise<ProjectSummary[] | null> {
  try {
    const url = tag
      ? `${API_URL}/api/projects?tag=${encodeURIComponent(tag)}`
      : `${API_URL}/api/projects`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ProjectSummary[];
  } catch {
    return null;
  }
}

async function getInsights(): Promise<Map<string, ProjectInsight>> {
  try {
    const res = await fetch(`${API_URL}/api/insights`, { cache: "no-store" });
    if (!res.ok) return new Map();
    const rows = (await res.json()) as ProjectInsight[];
    return new Map(rows.filter((r) => r.summary).map((r) => [r.projectId, r]));
  } catch {
    return new Map();
  }
}

function sslBandClass(days: number): string {
  if (days < 0) return "text-red-600";
  if (days <= 14) return "text-amber-600";
  return "text-accent-strong";
}

function severityClass(severity: string): string {
  if (severity === "critical") return "bg-red-50 text-red-700 border-red-200";
  if (severity === "warning") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-bg-subtle text-text-muted border-border";
}

function statusDot(status: string | null): string {
  if (status === "ok") return "bg-accent";
  if (status === "error") return "bg-red-500";
  if (status === "running") return "bg-amber-400";
  return "bg-border";
}

function formatMetric(m: ProjectMetric): string {
  const value = Number.isInteger(m.value) ? m.value : m.value.toFixed(2);
  return m.unit ? `${value} ${m.unit}` : `${value}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag: activeTag } = await searchParams;
  const [projects, insights] = await Promise.all([
    getProjects(activeTag),
    getInsights(),
  ]);

  // All tags seen across the returned projects, for the filter bar.
  const allTags = Array.from(
    new Set((projects ?? []).flatMap((p) => p.tags)),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-text-muted">
            Your projects at a glance — collected by Webmana connectors.
          </p>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <a href="/manage" className="text-accent-strong hover:underline">
            Manage
          </a>
          <a href="/sla" className="text-accent-strong hover:underline">
            SLA report
          </a>
          <a href="/" className="text-accent-strong hover:underline">
            ← Home
          </a>
        </nav>
      </header>

      {(allTags.length > 0 || activeTag) && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">Filter by tag:</span>
          <a
            href="/dashboard"
            className={`rounded-full border px-3 py-1 text-xs ${
              activeTag
                ? "border-border bg-surface text-text-muted hover:border-accent"
                : "border-accent bg-accent text-accent-ink"
            }`}
          >
            All
          </a>
          {(activeTag && !allTags.includes(activeTag)
            ? [activeTag, ...allTags]
            : allTags
          ).map((tag) => (
            <a
              key={tag}
              href={`/dashboard?tag=${encodeURIComponent(tag)}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                activeTag === tag
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-text-muted hover:border-accent"
              }`}
            >
              {tag}
            </a>
          ))}
        </div>
      )}

      {projects === null ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          Could not reach the API at <code>{API_URL}</code>. Is the stack running?
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg-subtle p-8 text-center text-text-muted">
          {activeTag ? (
            <>
              No projects tagged <span className="font-medium">{activeTag}</span>.{" "}
              <a href="/dashboard" className="text-accent-strong hover:underline">
                Clear filter
              </a>
            </>
          ) : (
            "No projects yet. Add a project and a connector to start collecting data."
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm"
            >
              <div>
                <h2 className="text-lg font-semibold">{project.name}</h2>
                <p className="font-mono text-sm text-text-muted">{project.domain}</p>
                {project.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                      <a
                        key={tag}
                        href={`/dashboard?tag=${encodeURIComponent(tag)}`}
                        className="rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-xs text-text-muted hover:border-accent"
                      >
                        {tag}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {insights.get(project.id)?.summary && (
                <div className="rounded-lg border border-accent/40 bg-accent/5 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accent-strong">
                    <span aria-hidden>✦</span> AI summary
                  </div>
                  <p className="text-sm text-text">{insights.get(project.id)!.summary}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {project.metrics.length === 0 ? (
                  <p className="text-sm text-text-muted">No metrics yet.</p>
                ) : (
                  project.metrics.map((m) => (
                    <div key={m.name} className="flex items-baseline justify-between">
                      <span className="text-sm text-text-muted">{m.name}</span>
                      <span
                        className={`font-medium ${
                          m.name === "ssl.days_until_expiry"
                            ? sslBandClass(m.value)
                            : "text-text"
                        }`}
                      >
                        {formatMetric(m)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {project.connectors.map((c) => (
                  <span
                    key={c.connectorId}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-subtle px-2.5 py-1 text-xs"
                    title={c.lastSyncError ?? c.lastSyncStatus ?? "never synced"}
                  >
                    <span className={`h-2 w-2 rounded-full ${statusDot(c.lastSyncStatus)}`} />
                    {c.connectorId}
                  </span>
                ))}
              </div>

              {project.events.length > 0 && (
                <ul className="flex flex-col gap-2 border-t border-border pt-3">
                  {project.events.slice(0, 3).map((e, i) => (
                    <li
                      key={i}
                      className={`rounded-lg border px-3 py-2 text-xs ${severityClass(e.severity)}`}
                    >
                      <span className="font-medium">{e.title}</span>
                      {e.description ? <span> — {e.description}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
