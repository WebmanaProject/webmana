"use client";

import { useEffect, useState } from "react";
import { useRequireAuth, authFetch } from "../../lib/auth";

interface AuditEntry {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetId: string | null;
  statusCode: number;
  createdAt: string;
}

const PAGE_SIZE = 25;

/** Compact relative time, e.g. "5m ago". Full timestamp goes in a title attr. */
function relativeTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function AuditPage() {
  useRequireAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0); // 0-based
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const statusQ = errorsOnly ? "status=err" : "";
    Promise.all([
      authFetch(`/api/audit/count${statusQ ? `?${statusQ}` : ""}`),
      authFetch(`/api/audit?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${statusQ ? `&${statusQ}` : ""}`),
    ])
      .then(async ([cRes, lRes]) => {
        if (!active) return;
        if (cRes.status === 403 || lRes.status === 403) {
          setForbidden(true);
          return;
        }
        if (cRes.ok) setTotal(((await cRes.json()) as { total: number }).total);
        if (lRes.ok) setEntries((await lRes.json()) as AuditEntry[]);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, errorsOnly]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  if (forbidden) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-text-muted">The audit log is admin-only.</p>
        <a href="/settings" className="text-accent-strong hover:underline">← Settings</a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-text-muted">
            Every change — who did what, and the result.
          </p>
        </div>
        <a href="/settings" className="text-sm text-accent-strong hover:underline">
          ← Settings
        </a>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => {
              setErrorsOnly(e.target.checked);
              setPage(0);
            }}
          />
          Errors only
        </label>
        <span className="text-xs text-text-muted">
          {total === 0 ? "No entries" : `${from}–${to} of ${total}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-bg-subtle text-left text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-3 py-2.5">When</th>
              <th className="px-3 py-2.5">Actor</th>
              <th className="px-3 py-2.5">Action</th>
              <th className="px-3 py-2.5">Target</th>
              <th className="px-3 py-2.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-text-muted">Loading…</td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-text-muted">
                  {errorsOnly ? "No errors recorded." : "No activity recorded yet."}
                </td>
              </tr>
            ) : (
              entries.map((a) => (
                <tr key={a.id} className="border-t border-border align-top">
                  <td
                    className="whitespace-nowrap px-3 py-2 text-xs text-text-muted"
                    title={new Date(a.createdAt).toLocaleString()}
                  >
                    {relativeTime(a.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {a.actorEmail ?? "system"}{" "}
                    {a.actorRole && <span className="text-xs text-text-muted">({a.actorRole})</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{a.action}</td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted" title={a.targetId ?? undefined}>
                    {a.targetId ? a.targetId.slice(0, 8) : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${a.statusCode >= 400 ? "text-red-600" : "text-text-muted"}`}>
                    {a.statusCode}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0 || loading}
          className="rounded-lg border border-border px-3 py-1.5 hover:border-accent disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-text-muted">
          Page {page + 1} of {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={page + 1 >= totalPages || loading}
          className="rounded-lg border border-border px-3 py-1.5 hover:border-accent disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </main>
  );
}
