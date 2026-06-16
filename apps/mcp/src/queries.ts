import { and, avg, count, desc, eq, gte, inArray, min, sql } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { computeHealthBand, type HealthBand } from "@webmana/contracts";

/** Events within this window count toward the live health band. */
const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ProjectListItem {
  id: string;
  name: string;
  domain: string | null;
  tags: string[];
  health: HealthBand;
  connectors: {
    connectorId: string;
    lastSyncStatus: string | null;
    lastSyncAt: string | null;
  }[];
}

export interface ProjectMetric {
  connectorId: string;
  kind: string;
  name: string;
  value: number;
  unit: string | null;
  labels: Record<string, unknown> | null;
  observedAt: string;
}

export interface ProjectEvent {
  severity: string;
  title: string;
  description: string | null;
  occurredAt: string;
  connectorId: string | null;
}

export interface ProjectDetail extends ProjectListItem {
  connectors: (ProjectListItem["connectors"][number] & {
    lastSyncError: string | null;
  })[];
  metrics: ProjectMetric[];
  events: ProjectEvent[];
}

/** Project ids belonging to an organization (the RBAC boundary for MCP). */
async function projectIdsForOrg(db: Database, organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.organizationId, organizationId));
  return rows.map((r) => r.id);
}

export async function listProjects(
  db: Database,
  organizationId: string,
  filterTag?: string,
): Promise<ProjectListItem[]> {
  const projectRows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      domain: schema.projects.domain,
    })
    .from(schema.projects)
    .where(eq(schema.projects.organizationId, organizationId))
    .orderBy(schema.projects.name);

  const ids = projectRows.map((p) => p.id);
  if (ids.length === 0) return [];

  const [tagRows, connectorRows, eventRows] = await Promise.all([
    db
      .select({
        projectId: schema.projectTags.projectId,
        tag: schema.projectTags.tag,
      })
      .from(schema.projectTags)
      .where(inArray(schema.projectTags.projectId, ids)),
    db
      .select({
        projectId: schema.connectorInstances.projectId,
        connectorId: schema.connectorInstances.connectorId,
        lastSyncStatus: schema.connectorInstances.lastSyncStatus,
        lastSyncAt: schema.connectorInstances.lastSyncAt,
      })
      .from(schema.connectorInstances)
      .where(inArray(schema.connectorInstances.projectId, ids)),
    db
      .select({
        projectId: schema.events.projectId,
        severity: schema.events.severity,
        occurredAt: schema.events.occurredAt,
      })
      .from(schema.events)
      .where(inArray(schema.events.projectId, ids))
      .orderBy(desc(schema.events.occurredAt))
      .limit(500),
  ]);

  const cutoff = Date.now() - HEALTH_WINDOW_MS;
  const normalizedFilter = filterTag?.trim().toLowerCase();

  const items = projectRows.map((project) => {
    const tags = tagRows
      .filter((t) => t.projectId === project.id)
      .map((t) => t.tag)
      .sort((a, b) => a.localeCompare(b));

    const connectors = connectorRows
      .filter((c) => c.projectId === project.id)
      .map((c) => ({
        connectorId: c.connectorId,
        lastSyncStatus: c.lastSyncStatus,
        lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
      }));

    let recentCriticalCount = 0;
    let recentWarningCount = 0;
    for (const e of eventRows) {
      if (e.projectId !== project.id || e.occurredAt.getTime() < cutoff) continue;
      if (e.severity === "critical") recentCriticalCount += 1;
      else if (e.severity === "warning") recentWarningCount += 1;
    }

    return {
      ...project,
      tags,
      health: computeHealthBand({
        connectors: connectors.map((c) => ({ lastSyncStatus: c.lastSyncStatus })),
        recentCriticalCount,
        recentWarningCount,
      }),
      connectors,
    };
  });

  if (!normalizedFilter) return items;
  return items.filter((p) => p.tags.some((t) => t.toLowerCase() === normalizedFilter));
}

export async function getProject(
  db: Database,
  organizationId: string,
  projectId: string,
): Promise<ProjectDetail | null> {
  const [project] = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      domain: schema.projects.domain,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!project) return null;

  const [tagRows, connectorRows, metricRows, eventRows] = await Promise.all([
    db
      .select({ tag: schema.projectTags.tag })
      .from(schema.projectTags)
      .where(eq(schema.projectTags.projectId, projectId)),
    db
      .select({
        connectorId: schema.connectorInstances.connectorId,
        lastSyncStatus: schema.connectorInstances.lastSyncStatus,
        lastSyncAt: schema.connectorInstances.lastSyncAt,
        lastSyncError: schema.connectorInstances.lastSyncError,
      })
      .from(schema.connectorInstances)
      .where(eq(schema.connectorInstances.projectId, projectId)),
    db
      .select({
        connectorId: schema.metrics.connectorId,
        kind: schema.metrics.kind,
        name: schema.metrics.name,
        value: schema.metrics.value,
        unit: schema.metrics.unit,
        labels: schema.metrics.labels,
        observedAt: schema.metrics.observedAt,
      })
      .from(schema.metrics)
      .where(eq(schema.metrics.projectId, projectId))
      .orderBy(desc(schema.metrics.observedAt))
      .limit(500),
    db
      .select({
        connectorId: schema.events.connectorId,
        severity: schema.events.severity,
        title: schema.events.title,
        description: schema.events.description,
        occurredAt: schema.events.occurredAt,
      })
      .from(schema.events)
      .where(eq(schema.events.projectId, projectId))
      .orderBy(desc(schema.events.occurredAt))
      .limit(20),
  ]);

  // metricRows are newest-first; keep only the latest per metric name.
  const seen = new Set<string>();
  const metrics: ProjectMetric[] = [];
  for (const m of metricRows) {
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    metrics.push({
      connectorId: m.connectorId,
      kind: m.kind,
      name: m.name,
      value: m.value,
      unit: m.unit,
      labels: m.labels as Record<string, unknown> | null,
      observedAt: m.observedAt.toISOString(),
    });
  }

  const cutoff = Date.now() - HEALTH_WINDOW_MS;
  let recentCriticalCount = 0;
  let recentWarningCount = 0;
  for (const e of eventRows) {
    if (e.occurredAt.getTime() < cutoff) continue;
    if (e.severity === "critical") recentCriticalCount += 1;
    else if (e.severity === "warning") recentWarningCount += 1;
  }

  return {
    ...project,
    tags: tagRows.map((t) => t.tag).sort((a, b) => a.localeCompare(b)),
    health: computeHealthBand({
      connectors: connectorRows.map((c) => ({ lastSyncStatus: c.lastSyncStatus })),
      recentCriticalCount,
      recentWarningCount,
    }),
    connectors: connectorRows.map((c) => ({
      connectorId: c.connectorId,
      lastSyncStatus: c.lastSyncStatus,
      lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
      lastSyncError: c.lastSyncError,
    })),
    metrics,
    events: eventRows.map((e) => ({
      severity: e.severity,
      title: e.title,
      description: e.description,
      occurredAt: e.occurredAt.toISOString(),
      connectorId: e.connectorId,
    })),
  };
}

export interface ProjectSla {
  projectId: string;
  name: string;
  domain: string | null;
  uptimePercent: number | null;
  samples: number;
  downSamples: number;
  since: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Uptime SLA per project over a trailing window (default 30 days, max 365). */
export async function getSlaReport(
  db: Database,
  organizationId: string,
  windowDays?: number,
): Promise<{ windowDays: number; from: string; projects: ProjectSla[] }> {
  const days = Math.min(Math.max(Math.floor(windowDays ?? 30), 1), 365);
  const from = new Date(Date.now() - days * DAY_MS);

  const projectRows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      domain: schema.projects.domain,
    })
    .from(schema.projects)
    .where(eq(schema.projects.organizationId, organizationId))
    .orderBy(schema.projects.name);

  const ids = projectRows.map((p) => p.id);
  if (ids.length === 0) {
    return { windowDays: days, from: from.toISOString(), projects: [] };
  }

  const uptimeRows = await db
    .select({
      projectId: schema.metrics.projectId,
      samples: count(),
      avgUp: avg(schema.metrics.value),
      downSamples: sql<number>`count(*) filter (where ${schema.metrics.value} = 0)`,
      since: min(schema.metrics.observedAt),
    })
    .from(schema.metrics)
    .where(
      and(
        inArray(schema.metrics.projectId, ids),
        eq(schema.metrics.name, "uptime.up"),
        gte(schema.metrics.observedAt, from),
      ),
    )
    .groupBy(schema.metrics.projectId);

  const byId = new Map(uptimeRows.map((r) => [r.projectId, r]));

  const projects: ProjectSla[] = projectRows.map((p) => {
    const u = byId.get(p.id);
    const avgUp = u?.avgUp != null ? Number(u.avgUp) : null;
    return {
      projectId: p.id,
      name: p.name,
      domain: p.domain,
      uptimePercent: avgUp != null ? Math.round(avgUp * 100 * 1000) / 1000 : null,
      samples: u ? Number(u.samples) : 0,
      downSamples: u ? Number(u.downSamples) : 0,
      since: u?.since ? u.since.toISOString() : null,
    };
  });

  return { windowDays: days, from: from.toISOString(), projects };
}

export interface ProjectInsight {
  projectId: string;
  summary: string;
  model: string;
  generatedAt: string;
}

/** Latest AI insight for one project, scoped to the org. Null when none/unseen. */
export async function getProjectInsight(
  db: Database,
  organizationId: string,
  projectId: string,
): Promise<ProjectInsight | null> {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!project) return null;

  const [insight] = await db
    .select({
      summary: schema.projectInsights.summary,
      model: schema.projectInsights.model,
      generatedAt: schema.projectInsights.generatedAt,
    })
    .from(schema.projectInsights)
    .where(eq(schema.projectInsights.projectId, projectId))
    .orderBy(desc(schema.projectInsights.generatedAt))
    .limit(1);
  if (!insight) return null;

  return {
    projectId,
    summary: insight.summary,
    model: insight.model,
    generatedAt: insight.generatedAt.toISOString(),
  };
}

export async function listRecentEvents(
  db: Database,
  organizationId: string,
  opts: { severity?: string; limit?: number } = {},
): Promise<(ProjectEvent & { projectId: string })[]> {
  const ids = await projectIdsForOrg(db, organizationId);
  if (ids.length === 0) return [];

  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const where = opts.severity
    ? and(
        inArray(schema.events.projectId, ids),
        eq(schema.events.severity, opts.severity as "info" | "warning" | "critical"),
      )
    : inArray(schema.events.projectId, ids);

  const rows = await db
    .select({
      projectId: schema.events.projectId,
      connectorId: schema.events.connectorId,
      severity: schema.events.severity,
      title: schema.events.title,
      description: schema.events.description,
      occurredAt: schema.events.occurredAt,
    })
    .from(schema.events)
    .where(where)
    .orderBy(desc(schema.events.occurredAt))
    .limit(limit);

  return rows.map((e) => ({
    projectId: e.projectId,
    connectorId: e.connectorId,
    severity: e.severity,
    title: e.title,
    description: e.description,
    occurredAt: e.occurredAt.toISOString(),
  }));
}

/* ------------------------------------------------------ Extended queries --- */

const WINDOW_DAY_MS = 24 * 60 * 60 * 1000;

/** Verify a project belongs to the org (so all reads stay scoped). */
async function projectInOrg(db: Database, organizationId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
    .limit(1);
  return !!row;
}

/**
 * Time-series metric history for a project (connector-gathered data), grouped
 * by metric name, over a trailing window (default 30d, max 365), downsampled.
 */
export async function queryMetrics(
  db: Database,
  organizationId: string,
  projectId: string,
  opts: { name?: string; windowDays?: number } = {},
) {
  if (!(await projectInOrg(db, organizationId, projectId))) {
    return { error: "project not found or not visible to this token" };
  }
  const days = Math.min(Math.max(opts.windowDays ?? 30, 1), 365);
  const since = new Date(Date.now() - days * WINDOW_DAY_MS);
  const where = opts.name
    ? and(eq(schema.metrics.projectId, projectId), gte(schema.metrics.observedAt, since), eq(schema.metrics.name, opts.name))
    : and(eq(schema.metrics.projectId, projectId), gte(schema.metrics.observedAt, since));

  const rows = await db
    .select({
      name: schema.metrics.name,
      unit: schema.metrics.unit,
      value: schema.metrics.value,
      observedAt: schema.metrics.observedAt,
    })
    .from(schema.metrics)
    .where(where)
    .orderBy(schema.metrics.observedAt);

  const byName = new Map<string, { unit: string | null; points: { t: string; v: number }[] }>();
  for (const r of rows) {
    const e = byName.get(r.name) ?? { unit: r.unit, points: [] };
    e.points.push({ t: r.observedAt.toISOString(), v: r.value });
    byName.set(r.name, e);
  }
  const cap = 200;
  return [...byName.entries()].map(([name, { unit, points }]) => {
    const step = points.length > cap ? Math.ceil(points.length / cap) : 1;
    return { name, unit, points: points.filter((_, i) => i % step === 0) };
  });
}

/** Domains in the org (optionally filtered to one project), with expiry + cost. */
export async function listDomains(db: Database, organizationId: string, projectId?: string) {
  if (projectId && !(await projectInOrg(db, organizationId, projectId))) {
    return { error: "project not found or not visible to this token" };
  }
  const rows = await db
    .select({
      id: schema.domains.id,
      fqdn: schema.domains.fqdn,
      registrar: schema.domains.registrar,
      expiresAt: schema.domains.expiresAt,
      autoRenew: schema.domains.autoRenew,
      renewalCost: schema.domains.renewalCost,
      costCurrency: schema.domains.costCurrency,
      projectId: schema.projectDomains.projectId,
      primary: schema.projectDomains.primary,
    })
    .from(schema.domains)
    .leftJoin(schema.projectDomains, eq(schema.projectDomains.domainId, schema.domains.id))
    .where(eq(schema.domains.organizationId, organizationId));
  const filtered = projectId ? rows.filter((r) => r.projectId === projectId) : rows;
  return filtered.map((d) => ({
    fqdn: d.fqdn,
    registrar: d.registrar,
    expiresAt: d.expiresAt,
    autoRenew: d.autoRenew,
    renewalCost: d.renewalCost,
    currency: d.costCurrency,
    projectId: d.projectId,
    primary: d.primary ?? false,
  }));
}

/** Open/acknowledged/resolved incidents in the org, newest first. */
export async function listIncidents(db: Database, organizationId: string, status?: string) {
  const valid = ["open", "acknowledged", "resolved"];
  const where = status && valid.includes(status)
    ? and(eq(schema.incidents.organizationId, organizationId), eq(schema.incidents.status, status as "open" | "acknowledged" | "resolved"))
    : eq(schema.incidents.organizationId, organizationId);
  const rows = await db
    .select({
      title: schema.incidents.title,
      severity: schema.incidents.severity,
      status: schema.incidents.status,
      projectId: schema.incidents.projectId,
      createdAt: schema.incidents.createdAt,
      resolvedAt: schema.incidents.resolvedAt,
    })
    .from(schema.incidents)
    .where(where)
    .orderBy(desc(schema.incidents.createdAt))
    .limit(100);
  return rows.map((r) => ({
    title: r.title,
    severity: r.severity,
    status: r.status,
    projectId: r.projectId,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));
}

/** Lightweight finance summary: annual domain renewals + latest MRR, by currency. */
export async function getFinanceSummary(db: Database, organizationId: string) {
  const [org] = await db
    .select({ baseCurrency: schema.organizations.baseCurrency })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  const domains = await db
    .select({ renewalCost: schema.domains.renewalCost, currency: schema.domains.costCurrency })
    .from(schema.domains)
    .where(eq(schema.domains.organizationId, organizationId));
  const annual: Record<string, number> = {};
  for (const d of domains) {
    if (d.renewalCost == null) continue;
    const c = d.currency ?? "?";
    annual[c] = Math.round(((annual[c] ?? 0) + d.renewalCost) * 100) / 100;
  }

  // Latest revenue.mrr per project (org-scoped), summed by currency.
  const projIds = (
    await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.organizationId, organizationId))
  ).map((p) => p.id);
  const mrr: Record<string, number> = {};
  if (projIds.length) {
    const rows = await db
      .select({ projectId: schema.metrics.projectId, value: schema.metrics.value, unit: schema.metrics.unit, observedAt: schema.metrics.observedAt })
      .from(schema.metrics)
      .where(and(eq(schema.metrics.name, "revenue.mrr"), inArray(schema.metrics.projectId, projIds)))
      .orderBy(desc(schema.metrics.observedAt));
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.projectId)) continue;
      seen.add(r.projectId);
      const c = r.unit ?? "?";
      mrr[c] = Math.round(((mrr[c] ?? 0) + r.value) * 100) / 100;
    }
  }
  return { baseCurrency: org?.baseCurrency ?? "USD", annualRenewalsByCurrency: annual, mrrByCurrency: mrr };
}
