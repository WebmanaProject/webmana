import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

export interface ProjectInsight {
  projectId: string;
  name: string;
  domain: string | null;
  summary: string | null;
  model: string | null;
  generatedAt: string | null;
}

@Injectable()
export class InsightsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Latest AI insight per project (null fields when none generated yet). */
  async latest(projectId?: string): Promise<ProjectInsight[]> {
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
    if (ids.length === 0) return [];

    // Newest-first; we keep the first row seen per project.
    const insightRows = await this.db
      .select({
        projectId: schema.projectInsights.projectId,
        summary: schema.projectInsights.summary,
        model: schema.projectInsights.model,
        generatedAt: schema.projectInsights.generatedAt,
      })
      .from(schema.projectInsights)
      .where(inArray(schema.projectInsights.projectId, ids))
      .orderBy(desc(schema.projectInsights.generatedAt));

    const latestByProject = new Map<string, (typeof insightRows)[number]>();
    for (const row of insightRows) {
      if (!latestByProject.has(row.projectId)) latestByProject.set(row.projectId, row);
    }

    return projectRows.map((p) => {
      const i = latestByProject.get(p.id);
      return {
        projectId: p.id,
        name: p.name,
        domain: p.domain,
        summary: i?.summary ?? null,
        model: i?.model ?? null,
        generatedAt: i?.generatedAt?.toISOString() ?? null,
      };
    });
  }
}
