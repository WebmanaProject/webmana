import { Inject, Injectable } from "@nestjs/common";
import { desc, inArray } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { computeHealthBand, type HealthBand } from "@webmana/contracts";
import { DATABASE } from "../db/db.module.js";

/** Events within this window count toward the live health band. */
const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;
/** How far back the public incident list reaches. */
const INCIDENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Max incidents shown per project on the public page. */
const MAX_INCIDENTS_PER_PROJECT = 5;

/** A public-safe incident: no internal descriptions or connector error bodies. */
export interface PublicIncident {
  severity: string;
  title: string;
  occurredAt: string;
}

export interface PublicProjectStatus {
  name: string;
  domain: string | null;
  health: HealthBand;
  incidents: PublicIncident[];
}

export type OverallStatus = "operational" | "degraded" | "down";

export interface StatusPage {
  generatedAt: string;
  /** Worst health across all projects, for the headline banner. */
  overall: OverallStatus;
  projects: PublicProjectStatus[];
}

@Injectable()
export class StatusService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Build the public status page: per-project health plus a short list of
   * recent incidents. Deliberately omits sync errors, metrics, and event
   * descriptions so nothing internal leaks to an unauthenticated viewer.
   */
  async getStatusPage(): Promise<StatusPage> {
    const now = Date.now();
    const generatedAt = new Date(now).toISOString();

    const projectRows = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        domain: schema.projects.domain,
      })
      .from(schema.projects)
      .orderBy(schema.projects.name);

    const ids = projectRows.map((p) => p.id);
    if (ids.length === 0) return { generatedAt, overall: "operational", projects: [] };

    const incidentCutoff = new Date(now - INCIDENT_WINDOW_MS);

    const [connectorRows, eventRows] = await Promise.all([
      this.db
        .select({
          projectId: schema.connectorInstances.projectId,
          lastSyncStatus: schema.connectorInstances.lastSyncStatus,
        })
        .from(schema.connectorInstances)
        .where(inArray(schema.connectorInstances.projectId, ids)),
      this.db
        .select({
          projectId: schema.events.projectId,
          severity: schema.events.severity,
          title: schema.events.title,
          occurredAt: schema.events.occurredAt,
        })
        .from(schema.events)
        .where(
          inArray(schema.events.projectId, ids),
        )
        .orderBy(desc(schema.events.occurredAt))
        .limit(500),
    ]);

    const healthCutoff = now - HEALTH_WINDOW_MS;

    const projects: PublicProjectStatus[] = projectRows.map((project) => {
      const connectors = connectorRows.filter((c) => c.projectId === project.id);
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

      const incidents: PublicIncident[] = projectEvents
        .filter(
          (e) =>
            e.occurredAt >= incidentCutoff &&
            (e.severity === "critical" || e.severity === "warning"),
        )
        .slice(0, MAX_INCIDENTS_PER_PROJECT)
        .map((e) => ({
          severity: e.severity,
          title: e.title,
          occurredAt: e.occurredAt.toISOString(),
        }));

      return { name: project.name, domain: project.domain, health, incidents };
    });

    const overall: OverallStatus = projects.some((p) => p.health === "down")
      ? "down"
      : projects.some((p) => p.health === "degraded")
        ? "degraded"
        : "operational";

    return { generatedAt, overall, projects };
  }

  /** Public RSS feed of recent incidents across all projects. */
  async getRssFeed(origin: string): Promise<string> {
    const page = await this.getStatusPage();
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const items = page.projects
      .flatMap((p) =>
        p.incidents.map((i) => ({
          title: `[${p.name}] ${i.title}`,
          severity: i.severity,
          occurredAt: i.occurredAt,
        })),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 50)
      .map(
        (i) =>
          `    <item><title>${esc(i.title)}</title>` +
          `<description>${esc(i.severity)}</description>` +
          `<pubDate>${new Date(i.occurredAt).toUTCString()}</pubDate>` +
          `<guid isPermaLink="false">${esc(i.title)}-${i.occurredAt}</guid></item>`,
      )
      .join("\n");

    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<rss version="2.0"><channel>\n` +
      `    <title>Webmana status</title>\n` +
      `    <link>${esc(origin)}/status</link>\n` +
      `    <description>Recent incidents — overall: ${page.overall}</description>\n` +
      `${items}\n` +
      `</channel></rss>\n`
    );
  }
}
