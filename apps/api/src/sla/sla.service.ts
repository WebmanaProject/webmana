import { Inject, Injectable } from "@nestjs/common";
import { and, avg, count, eq, gte, inArray, min, sql } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

/** The metric every uptime connector writes: 1 when up, 0 when down. */
const UPTIME_METRIC = "uptime.up";
/** The metric uptime connectors write for latency, in milliseconds. */
const RESPONSE_METRIC = "uptime.response_ms";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;

export interface ProjectSla {
  projectId: string;
  name: string;
  domain: string | null;
  /** Uptime percentage over the window, e.g. 99.95. Null when no samples. */
  uptimePercent: number | null;
  /** Number of uptime samples observed in the window. */
  samples: number;
  /** Count of samples where the check reported down. */
  downSamples: number;
  /** Mean response time in ms over the window, when available. */
  avgResponseMs: number | null;
  /** Timestamp of the earliest sample considered, for transparency. */
  since: string;
}

export interface SlaReport {
  generatedAt: string;
  windowDays: number;
  /** Inclusive lower bound of the window. */
  from: string;
  projects: ProjectSla[];
}

@Injectable()
export class SlaService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Uptime SLA per project over a trailing window.
   *
   * @param windowDays Trailing window length (clamped to 1..365, default 30).
   * @param projectId  When set, limit the report to a single project.
   */
  async report(windowDays?: number, projectId?: string): Promise<SlaReport> {
    const days = Math.min(Math.max(Math.floor(windowDays ?? DEFAULT_WINDOW_DAYS), 1), MAX_WINDOW_DAYS);
    const from = new Date(Date.now() - days * DAY_MS);

    const projectRows = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        domain: schema.projects.domain,
      })
      .from(schema.projects)
      .where(projectId ? eq(schema.projects.id, projectId) : undefined)
      .orderBy(schema.projects.name);

    const ids = projectRows.map((p) => p.id);
    if (ids.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        windowDays: days,
        from: from.toISOString(),
        projects: [],
      };
    }

    // Aggregate uptime samples per project in a single grouped query.
    const uptimeRows = await this.db
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
          eq(schema.metrics.name, UPTIME_METRIC),
          gte(schema.metrics.observedAt, from),
        ),
      )
      .groupBy(schema.metrics.projectId);

    const responseRows = await this.db
      .select({
        projectId: schema.metrics.projectId,
        avgResponse: avg(schema.metrics.value),
      })
      .from(schema.metrics)
      .where(
        and(
          inArray(schema.metrics.projectId, ids),
          eq(schema.metrics.name, RESPONSE_METRIC),
          gte(schema.metrics.observedAt, from),
        ),
      )
      .groupBy(schema.metrics.projectId);

    const uptimeById = new Map(uptimeRows.map((r) => [r.projectId, r]));
    const responseById = new Map(responseRows.map((r) => [r.projectId, r]));

    const projects: ProjectSla[] = projectRows.map((p) => {
      const u = uptimeById.get(p.id);
      const r = responseById.get(p.id);
      const samples = u ? Number(u.samples) : 0;
      const avgUp = u?.avgUp != null ? Number(u.avgUp) : null;
      const avgResponse = r?.avgResponse != null ? Number(r.avgResponse) : null;

      return {
        projectId: p.id,
        name: p.name,
        domain: p.domain,
        uptimePercent: avgUp != null ? round(avgUp * 100, 3) : null,
        samples,
        downSamples: u ? Number(u.downSamples) : 0,
        avgResponseMs: avgResponse != null ? round(avgResponse, 1) : null,
        since: (u?.since ?? from).toISOString(),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      windowDays: days,
      from: from.toISOString(),
      projects,
    };
  }
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
