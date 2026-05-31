import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

export interface TimelineEntry {
  projectId: string;
  projectName: string;
  domain: string;
  connectorId: string | null;
  severity: string;
  title: string;
  description: string | null;
  occurredAt: string;
}

export interface TimelineQuery {
  projectId?: string;
  severity?: "info" | "warning" | "critical";
  limit?: number;
}

@Injectable()
export class TimelineService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Unified, time-ordered activity feed (connector events + fired alerts). */
  async list(query: TimelineQuery = {}): Promise<TimelineEntry[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

    const filters = [];
    if (query.projectId) filters.push(eq(schema.events.projectId, query.projectId));
    if (query.severity) filters.push(eq(schema.events.severity, query.severity));

    const rows = await this.db
      .select({
        projectId: schema.events.projectId,
        projectName: schema.projects.name,
        domain: schema.projects.domain,
        connectorId: schema.events.connectorId,
        severity: schema.events.severity,
        title: schema.events.title,
        description: schema.events.description,
        occurredAt: schema.events.occurredAt,
      })
      .from(schema.events)
      .innerJoin(schema.projects, eq(schema.events.projectId, schema.projects.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(schema.events.occurredAt))
      .limit(limit);

    return rows.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName,
      domain: r.domain,
      connectorId: r.connectorId,
      severity: r.severity,
      title: r.title,
      description: r.description,
      occurredAt: r.occurredAt.toISOString(),
    }));
  }
}
