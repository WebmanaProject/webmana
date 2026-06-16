"use client";

import { useEffect, useState } from "react";
import { useRequireAuth, authFetch } from "../lib/auth";

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

export default function SlaPage() {
  useRequireAuth();
  const [activeWindow, setActiveWindow] = useState(30);
  const [report, setReport] = useState<SlaReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    authFetch(`/api/sla?windowDays=${activeWindow}`)
      .then(async (res) => {
        if (!active) return;
        if (res.ok) setReport((await res.json()) as SlaReport);
        else setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeWindow]);

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
          <button
            key={w}
            onClick={() => setActiveWindow(w)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              activeWindow === w
                ? "border-accent bg-accent text-accent-ink"
                : "border-border bg-surface text-text-muted hover:border-accent"
            }`}
          >
            {w} days
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-bg-subtle p-8 text-center text-text-muted">
          Loading…
        </div>
      ) : failed ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          Could not load the SLA report. Please try again.
        </div>
      ) : !report || report.projects.length === 0 ? (
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
