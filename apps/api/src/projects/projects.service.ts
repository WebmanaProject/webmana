import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { computeHealthBand, type HealthBand } from "@webmana/contracts";
import { DATABASE } from "../db/db.module.js";

/** Events within this window count toward the live health band. */
const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ProjectMetric {
  connectorId: string;
  kind: string;
  name: string;
  value: number;
  unit: string | null;
  labels: Record<string, unknown> | null;
  observedAt: string;
}

export interface ProjectConnector {
  connectorId: string;
  lastSyncStatus: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export interface ProjectEvent {
  severity: string;
  title: string;
  description: string | null;
  occurredAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  description: string | null;
  links: Record<string, string>;
  renewalCost: number | null;
  costCurrency: string | null;
  tags: string[];
  health: HealthBand;
  connectors: ProjectConnector[];
  metrics: ProjectMetric[];
  events: ProjectEvent[];
}

@Injectable()
export class ProjectsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * @param filterTag When set, only projects carrying this tag are returned.
   */
  async listProjects(filterTag?: string): Promise<ProjectSummary[]> {
    const projectRows = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        domain: schema.projects.domain,
        status: schema.projects.status,
        description: schema.projects.description,
        links: schema.projects.links,
      })
      .from(schema.projects)
      .orderBy(schema.projects.name);

    const ids = projectRows.map((p) => p.id);
    if (ids.length === 0) return [];

    const [tagRows, connectorRows, metricRows, eventRows, domainCostRows] = await Promise.all([
      this.db
        .select({
          projectId: schema.projectTags.projectId,
          tag: schema.projectTags.tag,
        })
        .from(schema.projectTags)
        .where(inArray(schema.projectTags.projectId, ids)),
      this.db
        .select({
          projectId: schema.connectorInstances.projectId,
          connectorId: schema.connectorInstances.connectorId,
          lastSyncStatus: schema.connectorInstances.lastSyncStatus,
          lastSyncAt: schema.connectorInstances.lastSyncAt,
          lastSyncError: schema.connectorInstances.lastSyncError,
        })
        .from(schema.connectorInstances)
        .where(inArray(schema.connectorInstances.projectId, ids)),
      this.db
        .select({
          projectId: schema.metrics.projectId,
          connectorId: schema.metrics.connectorId,
          kind: schema.metrics.kind,
          name: schema.metrics.name,
          value: schema.metrics.value,
          unit: schema.metrics.unit,
          labels: schema.metrics.labels,
          observedAt: schema.metrics.observedAt,
        })
        .from(schema.metrics)
        .where(inArray(schema.metrics.projectId, ids))
        .orderBy(desc(schema.metrics.observedAt))
        .limit(500),
      this.db
        .select({
          projectId: schema.events.projectId,
          severity: schema.events.severity,
          title: schema.events.title,
          description: schema.events.description,
          occurredAt: schema.events.occurredAt,
        })
        .from(schema.events)
        .where(inArray(schema.events.projectId, ids))
        .orderBy(desc(schema.events.occurredAt))
        .limit(200),
      // Per-project domain costs (renewal cost now lives on the domain).
      this.db
        .select({
          projectId: schema.projectDomains.projectId,
          primary: schema.projectDomains.primary,
          renewalCost: schema.domains.renewalCost,
          costCurrency: schema.domains.costCurrency,
        })
        .from(schema.projectDomains)
        .innerJoin(schema.domains, eq(schema.projectDomains.domainId, schema.domains.id))
        .where(inArray(schema.projectDomains.projectId, ids)),
    ]);

    const healthCutoff = Date.now() - HEALTH_WINDOW_MS;
    const normalizedFilter = filterTag?.trim().toLowerCase();

    const summaries = projectRows.map((project) => {
      const tags = tagRows
        .filter((t) => t.projectId === project.id)
        .map((t) => t.tag)
        .sort((a, b) => a.localeCompare(b));

      const connectors: ProjectConnector[] = connectorRows
        .filter((c) => c.projectId === project.id)
        .map((c) => ({
          connectorId: c.connectorId,
          lastSyncStatus: c.lastSyncStatus,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          lastSyncError: c.lastSyncError,
        }));

      // metricRows are sorted newest-first; keep only the latest per metric name.
      const seen = new Set<string>();
      const metrics: ProjectMetric[] = [];
      for (const m of metricRows) {
        if (m.projectId !== project.id || seen.has(m.name)) continue;
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

      // Annual renewal = sum of this project's domains' renewal costs; the
      // display currency follows the primary domain (else the first with cost).
      const projectDomainCosts = domainCostRows.filter((d) => d.projectId === project.id);
      let renewalCost: number | null = null;
      let costCurrency: string | null = null;
      for (const d of projectDomainCosts) {
        if (d.renewalCost != null) renewalCost = (renewalCost ?? 0) + d.renewalCost;
      }
      if (renewalCost != null) {
        renewalCost = Math.round(renewalCost * 100) / 100;
        costCurrency =
          projectDomainCosts.find((d) => d.primary && d.costCurrency)?.costCurrency ??
          projectDomainCosts.find((d) => d.costCurrency)?.costCurrency ??
          null;
      }

      const projectEvents = eventRows.filter((e) => e.projectId === project.id);

      let recentCriticalCount = 0;
      let recentWarningCount = 0;
      for (const e of projectEvents) {
        if (e.occurredAt.getTime() < healthCutoff) continue;
        if (e.severity === "critical") recentCriticalCount += 1;
        else if (e.severity === "warning") recentWarningCount += 1;
      }

      const health = computeHealthBand({
        connectors: connectors.map((c) => ({ lastSyncStatus: c.lastSyncStatus })),
        recentCriticalCount,
        recentWarningCount,
      });

      const events: ProjectEvent[] = projectEvents.slice(0, 10).map((e) => ({
        severity: e.severity,
        title: e.title,
        description: e.description,
        occurredAt: e.occurredAt.toISOString(),
      }));

      return {
        ...project,
        renewalCost,
        costCurrency,
        links: (project.links as Record<string, string>) ?? {},
        tags,
        health,
        connectors,
        metrics,
        events,
      };
    });

    if (!normalizedFilter) return summaries;
    return summaries.filter((p) =>
      p.tags.some((t) => t.toLowerCase() === normalizedFilter),
    );
  }
}
