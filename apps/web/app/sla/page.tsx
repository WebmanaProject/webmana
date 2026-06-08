interface ProjectSla {
  projectId: string;
  name: string;
  domain: string | null;
  uptimePercent: number | null;
  samples: number;
  downSamples: number;
  avgResponseMs: number | null;
  since: string;
}

interface SlaReport {
  generatedAt: string;
  windowDays: number;
  from: string;
  projects: ProjectSla[];
}

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function getReport(windowDays: number): Promise<SlaReport | null> {
  try {
    const res = await fetch(`${API_URL}/api/sla?windowDays=${windowDays}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SlaReport;
  } catch {
    return null;
  }
}

const WINDOWS = [7, 30, 90];

function slaClass(pct: number | null): string {
  if (pct === null) return "text-text-muted";
  if (pct >= 99.9) return "text-accent-strong";
  if (pct >= 99) return "text-amber-600";
  return "text-red-600";
}

function formatPct(pct: number | null): string {
  return pct === null ? "—" : `${pct.toFixed(3)}%`;
}

export default async function SlaPage({
  searchParams,
}: {
  searchParams: Promise<{ windowDays?: string }>;
}) {
  const { windowDays } = await searchParams;
  const parsed = Number(windowDays);
  const activeWindow = WINDOWS.includes(parsed) ? parsed : 30;
  const report = await getReport(activeWindow);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">SLA report</h1>
          <p className="mt-1 text-text-muted">
            Uptime over the trailing {activeWindow} days, computed from stored
            uptime checks.
          </p>
        </div>
        <a href="/dashboard" className="text-sm text-accent-strong hover:underline">
          ← Dashboard
        </a>
      </header>

      <div className="mb-8 flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-muted">Window:</span>
        {WINDOWS.map((w) => (
          <a
            key={w}
            href={`/sla?windowDays=${w}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              activeWindow === w
                ? "border-accent bg-accent text-accent-ink"
                : "border-border bg-surface text-text-muted hover:border-accent"
            }`}
          >
            {w} days
          </a>
        ))}
      </div>

      {report === null ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          Could not reach the API at <code>{API_URL}</code>. Is the stack running?
        </div>
      ) : report.projects.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg-subtle p-8 text-center text-text-muted">
          No projects yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-subtle text-left text-text-muted">
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Uptime</th>
                <th className="px-4 py-3 text-right font-medium">Samples</th>
                <th className="px-4 py-3 text-right font-medium">Down</th>
                <th className="px-4 py-3 text-right font-medium">Avg response</th>
              </tr>
            </thead>
            <tbody>
              {report.projects.map((p) => (
                <tr key={p.projectId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-xs text-text-muted">{p.domain}</div>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${slaClass(p.uptimePercent)}`}>
                    {formatPct(p.uptimePercent)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.samples}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.downSamples}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.avgResponseMs === null ? "—" : `${p.avgResponseMs} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report && (
        <p className="mt-4 text-xs text-text-muted">
          Generated {new Date(report.generatedAt).toLocaleString()} · samples since{" "}
          {new Date(report.from).toLocaleDateString()}.
        </p>
      )}
    </main>
  );
}
