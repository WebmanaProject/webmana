import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

type IncidentStatus = "open" | "acknowledged" | "resolved";
type Severity = "info" | "warning" | "critical";

const STATUSES: IncidentStatus[] = ["open", "acknowledged", "resolved"];
const SEVERITIES: Severity[] = ["info", "warning", "critical"];

export interface CreateIncidentInput {
  title: string;
  description?: string | null;
  severity?: Severity;
  projectId?: string | null;
}

export interface UpdateIncidentInput {
  status?: IncidentStatus;
  title?: string;
  description?: string | null;
  severity?: Severity;
}

@Injectable()
export class IncidentsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async defaultOrgId(): Promise<string> {
    const [org] = await this.db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .orderBy(asc(schema.organizations.createdAt))
      .limit(1);
    if (!org) throw new BadRequestException("no organization exists");
    return org.id;
  }

  /** Incidents for the org, newest first; open/acknowledged before resolved. */
  async list(status?: string) {
    const orgId = await this.defaultOrgId();
    const where =
      status && STATUSES.includes(status as IncidentStatus)
        ? and(eq(schema.incidents.organizationId, orgId), eq(schema.incidents.status, status as IncidentStatus))
        : eq(schema.incidents.organizationId, orgId);

    const rows = await this.db
      .select({
        id: schema.incidents.id,
        projectId: schema.incidents.projectId,
        projectName: schema.projects.name,
        title: schema.incidents.title,
        description: schema.incidents.description,
        severity: schema.incidents.severity,
        status: schema.incidents.status,
        acknowledgedAt: schema.incidents.acknowledgedAt,
        resolvedAt: schema.incidents.resolvedAt,
        createdAt: schema.incidents.createdAt,
      })
      .from(schema.incidents)
      .leftJoin(schema.projects, eq(schema.incidents.projectId, schema.projects.id))
      .where(where)
      .orderBy(desc(schema.incidents.createdAt));

    // Active incidents (open/acknowledged) sort above resolved ones.
    const rank = (s: string) => (s === "resolved" ? 1 : 0);
    return rows
      .map((r) => ({
        ...r,
        acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }))
      .sort((a, b) => rank(a.status) - rank(b.status));
  }

  async create(input: CreateIncidentInput): Promise<{ id: string }> {
    const title = input.title?.trim();
    if (!title) throw new BadRequestException("title is required");
    const severity = input.severity ?? "warning";
    if (!SEVERITIES.includes(severity)) throw new BadRequestException("invalid severity");
    const orgId = await this.defaultOrgId();

    const [created] = await this.db
      .insert(schema.incidents)
      .values({
        organizationId: orgId,
        projectId: input.projectId?.trim() || null,
        title,
        description: input.description?.trim() || null,
        severity,
      })
      .returning({ id: schema.incidents.id });
    if (!created) throw new BadRequestException("failed to create incident");
    return { id: created.id };
  }

  async update(id: string, input: UpdateIncidentInput): Promise<void> {
    const orgId = await this.defaultOrgId();
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (input.status !== undefined) {
      if (!STATUSES.includes(input.status)) throw new BadRequestException("invalid status");
      patch.status = input.status;
      // Stamp lifecycle transitions.
      patch.acknowledgedAt =
        input.status === "open" ? null : (await this.currentAck(id, orgId)) ?? new Date();
      patch.resolvedAt = input.status === "resolved" ? new Date() : null;
    }
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException("title cannot be empty");
      patch.title = title;
    }
    if (input.description !== undefined) patch.description = input.description?.trim() || null;
    if (input.severity !== undefined) {
      if (!SEVERITIES.includes(input.severity)) throw new BadRequestException("invalid severity");
      patch.severity = input.severity;
    }

    const updated = await this.db
      .update(schema.incidents)
      .set(patch)
      .where(and(eq(schema.incidents.id, id), eq(schema.incidents.organizationId, orgId)))
      .returning({ id: schema.incidents.id });
    if (updated.length === 0) throw new NotFoundException("incident not found");
  }

  /** Preserve the first acknowledgement time across later transitions. */
  private async currentAck(id: string, orgId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ acknowledgedAt: schema.incidents.acknowledgedAt })
      .from(schema.incidents)
      .where(and(eq(schema.incidents.id, id), eq(schema.incidents.organizationId, orgId)))
      .limit(1);
    return row?.acknowledgedAt ?? null;
  }

  async remove(id: string): Promise<void> {
    const orgId = await this.defaultOrgId();
    const deleted = await this.db
      .delete(schema.incidents)
      .where(and(eq(schema.incidents.id, id), eq(schema.incidents.organizationId, orgId)))
      .returning({ id: schema.incidents.id });
    if (deleted.length === 0) throw new NotFoundException("incident not found");
  }
}
