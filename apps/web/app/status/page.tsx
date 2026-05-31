interface PublicIncident {
  severity: string;
  title: string;
  occurredAt: string;
}

interface PublicProjectStatus {
  name: string;
  domain: string;
  health: "healthy" | "degraded" | "down" | "unknown";
  incidents: PublicIncident[];
}

interface StatusPage {
  generatedAt: string;
  projects: PublicProjectStatus[];
}

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function getStatus(): Promise<StatusPage | null> {
  try {
    const res = await fetch(`${API_URL}/api/status`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as StatusPage;
  } catch {
    return null;
  }
}

const HEALTH_META: Record<
  PublicProjectStatus["health"],
  { label: string; dot: string; text: string }
> = {
  healthy: { label: "Operational", dot: "bg-accent", text: "text-accent-strong" },
  degraded: { label: "Degraded", dot: "bg-amber-400", text: "text-amber-600" },
  down: { label: "Down", dot: "bg-red-500", text: "text-red-600" },
  unknown: { label: "Unknown", dot: "bg-border", text: "text-text-muted" },
};

function severityClass(severity: string): string {
  if (severity === "critical") return "bg-red-50 text-red-700 border-red-200";
  if (severity === "warning") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-bg-subtle text-text-muted border-border";
}

const RANK: Record<PublicProjectStatus["health"], number> = {
  down: 3,
  degraded: 2,
  unknown: 1,
  healthy: 0,
};

function overall(projects: PublicProjectStatus[]): PublicProjectStatus["health"] {
  if (projects.length === 0) return "unknown";
  return projects.reduce<PublicProjectStatus["health"]>(
    (worst, p) => (RANK[p.health] > RANK[worst] ? p.health : worst),
    "healthy",
  );
}

export default async function StatusPageView() {
  const status = await getStatus();

  if (status === null) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          Status is temporarily unavailable.
        </div>
      </main>
    );
  }

  const banner = HEALTH_META[overall(status.projects)];

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Service Status</h1>
        <p className="mt-2 flex items-center gap-2 text-lg">
          <span className={`h-3 w-3 rounded-full ${banner.dot}`} />
          <span className={`font-medium ${banner.text}`}>
            {status.projects.length === 0 ? "No services monitored" : banner.label}
          </span>
        </p>
        <p className="mt-1 text-sm text-text-muted">
          Updated {new Date(status.generatedAt).toLocaleString()}
        </p>
      </header>

      {status.projects.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg-subtle p-8 text-center text-text-muted">
          Nothing is being monitored yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {status.projects.map((project) => {
            const meta = HEALTH_META[project.health];
            return (
              <article
                key={project.domain}
                className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{project.name}</h2>
                    <p className="font-mono text-sm text-text-muted">{project.domain}</p>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                    <span className={`text-sm font-medium ${meta.text}`}>{meta.label}</span>
                  </span>
                </div>

                {project.incidents.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                    {project.incidents.map((incident, i) => (
                      <li
                        key={i}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${severityClass(incident.severity)}`}
                      >
                        <span className="font-medium">{incident.title}</span>
                        <time className="shrink-0 opacity-70">
                          {new Date(incident.occurredAt).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
