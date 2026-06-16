import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { getConnector, connectors } from "@webmana/connectors";
import { encryptSecrets, decryptSecrets } from "@webmana/crypto";
import { projectStatusSchema, type ProjectStatus } from "@webmana/contracts";
import { DATABASE } from "../db/db.module.js";

export interface CreateProjectInput {
  name: string;
  /** Optional — ideas/early-stage projects may not have a domain yet. */
  domain?: string;
  status?: ProjectStatus;
  description?: string;
  links?: Record<string, string>;
  tags?: string[];
}

export interface UpdateProjectInput {
  name?: string;
  domain?: string | null;
  status?: ProjectStatus;
  description?: string | null;
  links?: Record<string, string>;
  tags?: string[];
}

/** A domain assigned to a project, as shown in the project workspace. */
export interface ProjectDomainView {
  id: string;
  fqdn: string;
  primary: boolean;
  registrar: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  purchaseCost: number | null;
  renewalCost: number | null;
  costCurrency: string | null;
  purchaseDate: string | null;
}

export interface AssignDomainInput {
  /** Domain to attach. Created in the org if it does not exist yet. */
  fqdn: string;
  /** Make this the project's primary domain (drives monitoring + display). */
  primary?: boolean;
}

export interface CreateNoteInput {
  body: string;
  /** When true the item is a checklist task (defaults to a plain note). */
  done?: boolean;
}

export interface UpdateNoteInput {
  body?: string;
  done?: boolean;
}

export interface UpsertConnectorInput {
  connectorId: string;
  config?: Record<string, unknown>;
  /** Plaintext secrets; encrypted before storage, never persisted in the clear. */
  secrets?: Record<string, string>;
  enabled?: boolean;
}

/** Catalog entry describing a connector available to add. */
export interface ConnectorCatalogItem {
  id: string;
  title: string;
  requiresSecrets: boolean;
  defaultIntervalSeconds: number;
}

export interface CreateAlertRuleInput {
  metricName: string;
  operator: string;
  threshold: number;
  severity?: "info" | "warning" | "critical";
  cooldownSeconds?: number;
}

export interface CreateAlertChannelInput {
  kind: "webhook" | "slack" | "email";
  config: Record<string, unknown>;
  /** Routing: minimum severity to deliver (default info). */
  minSeverity?: "info" | "warning" | "critical";
  /** Routing: only deliver alerts for projects with this tag. */
  tagFilter?: string | null;
}

export interface CreateBudgetInput {
  scope: "project" | "tag" | "org";
  /** Project id (scope=project) or tag (scope=tag); ignored for org. */
  ref?: string | null;
  period?: "monthly" | "annual";
  amount: number;
  currency: string;
}

export interface UpdateBudgetInput {
  period?: "monthly" | "annual";
  amount?: number;
  currency?: string;
}

export interface UpsertFxRateInput {
  currency: string;
  rateToBase: number;
}

export interface CreateMaintenanceInput {
  /** Target project; omit/null suppresses alerts org-wide. */
  projectId?: string | null;
  reason?: string | null;
  /** ISO datetimes. */
  startsAt: string;
  endsAt: string;
}

const OPERATORS = ["lt", "lte", "gt", "gte", "eq"];
const SEVERITIES = ["info", "warning", "critical"];
const CHANNEL_KINDS = ["webhook", "slack", "email"];

@Injectable()
export class ManageService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Resolve the default organization (single-org MVP: the first one). */
  private async defaultOrgId(): Promise<string> {
    const [org] = await this.db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .orderBy(schema.organizations.createdAt)
      .limit(1);
    if (!org) {
      throw new BadRequestException(
        "No organization exists yet. Seed one before creating projects.",
      );
    }
    return org.id;
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    const seen = new Set<string>();
    for (const raw of tags) {
      const t = raw.trim();
      if (t) seen.add(t);
    }
    return [...seen];
  }

  private async replaceTags(projectId: string, tags: string[]): Promise<void> {
    await this.db
      .delete(schema.projectTags)
      .where(eq(schema.projectTags.projectId, projectId));
    if (tags.length > 0) {
      await this.db
        .insert(schema.projectTags)
        .values(tags.map((tag) => ({ projectId, tag })));
    }
  }

  /** Projects with their tags, connector instances, and assigned domains. */
  async listProjectsForManagement(): Promise<
    {
      id: string;
      name: string;
      domain: string | null;
      status: ProjectStatus;
      description: string | null;
      links: Record<string, string>;
      tags: string[];
      domains: ProjectDomainView[];
      connectors: {
        id: string;
        connectorId: string;
        enabled: boolean;
        lastSyncStatus: string | null;
        lastSyncError: string | null;
        enabledActions: string[];
        actions: { id: string; title: string; description?: string; destructive: boolean }[];
      }[];
    }[]
  > {
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

    const [tagRows, connectorRows, domainRows] = await Promise.all([
      this.db
        .select({ projectId: schema.projectTags.projectId, tag: schema.projectTags.tag })
        .from(schema.projectTags),
      this.db
        .select({
          id: schema.connectorInstances.id,
          projectId: schema.connectorInstances.projectId,
          connectorId: schema.connectorInstances.connectorId,
          enabled: schema.connectorInstances.enabled,
          lastSyncStatus: schema.connectorInstances.lastSyncStatus,
          lastSyncError: schema.connectorInstances.lastSyncError,
          enabledActions: schema.connectorInstances.enabledActions,
        })
        .from(schema.connectorInstances),
      this.db
        .select({
          projectId: schema.projectDomains.projectId,
          primary: schema.projectDomains.primary,
          id: schema.domains.id,
          fqdn: schema.domains.fqdn,
          registrar: schema.domains.registrar,
          expiresAt: schema.domains.expiresAt,
          autoRenew: schema.domains.autoRenew,
          purchaseCost: schema.domains.purchaseCost,
          renewalCost: schema.domains.renewalCost,
          costCurrency: schema.domains.costCurrency,
          purchaseDate: schema.domains.purchaseDate,
        })
        .from(schema.projectDomains)
        .innerJoin(schema.domains, eq(schema.projectDomains.domainId, schema.domains.id)),
    ]);

    return projectRows.map((p) => ({
      ...p,
      links: (p.links as Record<string, string>) ?? {},
      tags: tagRows
        .filter((t) => t.projectId === p.id)
        .map((t) => t.tag)
        .sort((a, b) => a.localeCompare(b)),
      domains: domainRows
        .filter((d) => d.projectId === p.id)
        .map((d) => ({
          id: d.id,
          fqdn: d.fqdn,
          primary: d.primary,
          registrar: d.registrar,
          expiresAt: d.expiresAt,
          autoRenew: d.autoRenew,
          purchaseCost: d.purchaseCost,
          renewalCost: d.renewalCost,
          costCurrency: d.costCurrency,
          purchaseDate: d.purchaseDate,
        }))
        .sort((a, b) => Number(b.primary) - Number(a.primary) || a.fqdn.localeCompare(b.fqdn)),
      connectors: connectorRows
        .filter((c) => c.projectId === p.id)
        .map((c) => ({
          id: c.id,
          connectorId: c.connectorId,
          enabled: c.enabled,
          lastSyncStatus: c.lastSyncStatus,
          lastSyncError: c.lastSyncError,
          enabledActions: (c.enabledActions as string[]) ?? [],
          actions: (getConnector(c.connectorId)?.actions ?? []).map((a) => ({
            id: a.id,
            title: a.title,
            description: a.description,
            destructive: a.destructive ?? false,
          })),
        })),
    }));
  }

  /** The connectors available to add to a project. */
  listConnectorCatalog(): ConnectorCatalogItem[] {
    return Object.values(connectors).map((c) => ({
      id: c.id,
      title: c.title,
      requiresSecrets: c.requiresSecrets,
      defaultIntervalSeconds: c.defaultIntervalSeconds,
    }));
  }

  private parseStatus(status?: ProjectStatus): ProjectStatus | undefined {
    if (status === undefined) return undefined;
    const parsed = projectStatusSchema.safeParse(status);
    if (!parsed.success) throw new BadRequestException(`invalid status "${status}"`);
    return parsed.data;
  }

  async createProject(input: CreateProjectInput): Promise<{ id: string }> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException("name is required");
    const domain = input.domain?.trim() || null;
    const status = this.parseStatus(input.status) ?? "idea";

    const organizationId = await this.defaultOrgId();
    const values: Record<string, unknown> = {
      organizationId,
      name,
      domain,
      status,
      description: input.description?.trim() || null,
      links: input.links ?? {},
    };
    const [created] = await this.db
      .insert(schema.projects)
      .values(values as typeof schema.projects.$inferInsert)
      .returning({ id: schema.projects.id });
    if (!created) throw new BadRequestException("failed to create project");

    const tags = this.normalizeTags(input.tags);
    if (tags.length > 0) await this.replaceTags(created.id, tags);

    return { id: created.id };
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<void> {
    const [project] = await this.db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException("project not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException("name cannot be empty");
      patch.name = name;
    }
    if (input.domain !== undefined) {
      // Empty string or null clears the domain (e.g. project not yet deployed).
      patch.domain = input.domain ? input.domain.trim() || null : null;
    }
    if (input.status !== undefined) {
      patch.status = this.parseStatus(input.status);
    }
    if (input.description !== undefined) {
      patch.description = input.description ? input.description.trim() || null : null;
    }
    if (input.links !== undefined) {
      patch.links = input.links;
    }

    await this.db
      .update(schema.projects)
      .set(patch)
      .where(eq(schema.projects.id, projectId));

    if (input.tags !== undefined) {
      await this.replaceTags(projectId, this.normalizeTags(input.tags));
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const deleted = await this.db
      .delete(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .returning({ id: schema.projects.id });
    if (deleted.length === 0) throw new NotFoundException("project not found");
  }

  /* ------------------------------------------------------------ Domains ----- */

  private async requireProject(projectId: string): Promise<void> {
    const [project] = await this.db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException("project not found");
  }

  /** All domains in the org, for the project assignment picker. */
  async listDomainsForPicker(): Promise<{ id: string; fqdn: string }[]> {
    const orgId = await this.defaultOrgId();
    return this.db
      .select({ id: schema.domains.id, fqdn: schema.domains.fqdn })
      .from(schema.domains)
      .where(eq(schema.domains.organizationId, orgId))
      .orderBy(schema.domains.fqdn);
  }

  /** Re-point the project's legacy `domain` column at its current primary. */
  private async syncPrimaryDomainColumn(projectId: string): Promise<void> {
    const [primary] = await this.db
      .select({ fqdn: schema.domains.fqdn })
      .from(schema.projectDomains)
      .innerJoin(schema.domains, eq(schema.projectDomains.domainId, schema.domains.id))
      .where(
        and(
          eq(schema.projectDomains.projectId, projectId),
          eq(schema.projectDomains.primary, true),
        ),
      )
      .limit(1);
    await this.db
      .update(schema.projects)
      .set({ domain: primary?.fqdn ?? null, updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
  }

  /** Mark exactly one assigned domain primary (clears the others), then sync. */
  private async setPrimaryInternal(projectId: string, domainId: string): Promise<void> {
    await this.db
      .update(schema.projectDomains)
      .set({ primary: false })
      .where(eq(schema.projectDomains.projectId, projectId));
    await this.db
      .update(schema.projectDomains)
      .set({ primary: true })
      .where(
        and(
          eq(schema.projectDomains.projectId, projectId),
          eq(schema.projectDomains.domainId, domainId),
        ),
      );
    await this.syncPrimaryDomainColumn(projectId);
  }

  /** Attach a domain to a project, creating the domain in the org if new. */
  async assignDomain(projectId: string, input: AssignDomainInput): Promise<{ id: string }> {
    await this.requireProject(projectId);
    const fqdn = input.fqdn?.trim().toLowerCase();
    if (!fqdn) throw new BadRequestException("fqdn is required");

    const orgId = await this.defaultOrgId();
    let [domain] = await this.db
      .select({ id: schema.domains.id })
      .from(schema.domains)
      .where(and(eq(schema.domains.organizationId, orgId), eq(schema.domains.fqdn, fqdn)))
      .limit(1);

    if (!domain) {
      [domain] = await this.db
        .insert(schema.domains)
        .values({ organizationId: orgId, fqdn })
        .returning({ id: schema.domains.id });
    }
    if (!domain) throw new BadRequestException("failed to create domain");

    // First domain on a project becomes primary automatically.
    const existing = await this.db
      .select({ domainId: schema.projectDomains.domainId })
      .from(schema.projectDomains)
      .where(eq(schema.projectDomains.projectId, projectId));
    const makePrimary = input.primary === true || existing.length === 0;

    await this.db
      .insert(schema.projectDomains)
      .values({ projectId, domainId: domain.id, primary: makePrimary })
      .onConflictDoNothing();

    if (makePrimary) await this.setPrimaryInternal(projectId, domain.id);
    return { id: domain.id };
  }

  async setPrimaryDomain(projectId: string, domainId: string): Promise<void> {
    await this.requireProject(projectId);
    const [link] = await this.db
      .select({ domainId: schema.projectDomains.domainId })
      .from(schema.projectDomains)
      .where(
        and(
          eq(schema.projectDomains.projectId, projectId),
          eq(schema.projectDomains.domainId, domainId),
        ),
      )
      .limit(1);
    if (!link) throw new NotFoundException("domain is not assigned to this project");
    await this.setPrimaryInternal(projectId, domainId);
  }

  /** Detach a domain from a project (the domain entity itself is kept). */
  async unassignDomain(projectId: string, domainId: string): Promise<void> {
    const deleted = await this.db
      .delete(schema.projectDomains)
      .where(
        and(
          eq(schema.projectDomains.projectId, projectId),
          eq(schema.projectDomains.domainId, domainId),
        ),
      )
      .returning({ domainId: schema.projectDomains.domainId });
    if (deleted.length === 0) throw new NotFoundException("domain is not assigned to this project");

    // If we removed the primary, promote the next remaining domain (if any).
    const remaining = await this.db
      .select({
        domainId: schema.projectDomains.domainId,
        primary: schema.projectDomains.primary,
      })
      .from(schema.projectDomains)
      .where(eq(schema.projectDomains.projectId, projectId));
    if (remaining.length > 0 && !remaining.some((r) => r.primary)) {
      await this.setPrimaryInternal(projectId, remaining[0]!.domainId);
    } else {
      await this.syncPrimaryDomainColumn(projectId);
    }
  }

  /* ------------------------------------------------------------- Notes ----- */

  async listNotes(projectId: string) {
    return this.db
      .select({
        id: schema.projectNotes.id,
        body: schema.projectNotes.body,
        done: schema.projectNotes.done,
        createdAt: schema.projectNotes.createdAt,
      })
      .from(schema.projectNotes)
      .where(eq(schema.projectNotes.projectId, projectId))
      .orderBy(schema.projectNotes.createdAt);
  }

  async addNote(projectId: string, input: CreateNoteInput): Promise<{ id: string }> {
    await this.requireProject(projectId);
    const body = input.body?.trim();
    if (!body) throw new BadRequestException("note body is required");
    const [created] = await this.db
      .insert(schema.projectNotes)
      .values({ projectId, body, done: input.done ?? false })
      .returning({ id: schema.projectNotes.id });
    if (!created) throw new BadRequestException("failed to create note");
    return { id: created.id };
  }

  async updateNote(projectId: string, noteId: string, input: UpdateNoteInput): Promise<void> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.body !== undefined) {
      const body = input.body.trim();
      if (!body) throw new BadRequestException("note body cannot be empty");
      patch.body = body;
    }
    if (input.done !== undefined) patch.done = Boolean(input.done);
    const updated = await this.db
      .update(schema.projectNotes)
      .set(patch)
      .where(and(eq(schema.projectNotes.id, noteId), eq(schema.projectNotes.projectId, projectId)))
      .returning({ id: schema.projectNotes.id });
    if (updated.length === 0) throw new NotFoundException("note not found");
  }

  async deleteNote(projectId: string, noteId: string): Promise<void> {
    const deleted = await this.db
      .delete(schema.projectNotes)
      .where(and(eq(schema.projectNotes.id, noteId), eq(schema.projectNotes.projectId, projectId)))
      .returning({ id: schema.projectNotes.id });
    if (deleted.length === 0) throw new NotFoundException("note not found");
  }

  /** Create or update a connector instance for a project. */
  async upsertConnector(
    projectId: string,
    input: UpsertConnectorInput,
  ): Promise<{ id: string }> {
    const [project] = await this.db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException("project not found");

    const connector = getConnector(input.connectorId);
    if (!connector) {
      throw new BadRequestException(`unknown connector "${input.connectorId}"`);
    }

    // Validate the supplied config against the connector's own schema.
    const config = input.config ?? {};
    const parsed = connector.configSchema.safeParse(config);
    if (!parsed.success) {
      throw new BadRequestException(
        `invalid config for "${input.connectorId}": ${parsed.error.message}`,
      );
    }

    const hasSecrets = input.secrets && Object.keys(input.secrets).length > 0;
    const encryptedSecrets = hasSecrets ? encryptSecrets(input.secrets!) : undefined;

    const [existing] = await this.db
      .select({ id: schema.connectorInstances.id })
      .from(schema.connectorInstances)
      .where(
        and(
          eq(schema.connectorInstances.projectId, projectId),
          eq(schema.connectorInstances.connectorId, input.connectorId),
        ),
      )
      .limit(1);

    if (existing) {
      const patch: Record<string, unknown> = {
        config,
        enabled: input.enabled ?? true,
        updatedAt: new Date(),
      };
      // Only overwrite secrets when new ones are supplied (keeps existing otherwise).
      if (encryptedSecrets !== undefined) patch.encryptedSecrets = encryptedSecrets;
      await this.db
        .update(schema.connectorInstances)
        .set(patch)
        .where(eq(schema.connectorInstances.id, existing.id));
      return { id: existing.id };
    }

    const [created] = await this.db
      .insert(schema.connectorInstances)
      .values({
        projectId,
        connectorId: input.connectorId,
        config,
        encryptedSecrets: encryptedSecrets ?? null,
        enabled: input.enabled ?? true,
      })
      .returning({ id: schema.connectorInstances.id });
    if (!created) throw new BadRequestException("failed to create connector");
    return { id: created.id };
  }

  async setConnectorEnabled(
    projectId: string,
    connectorInstanceId: string,
    enabled: boolean,
  ): Promise<void> {
    const updated = await this.db
      .update(schema.connectorInstances)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(schema.connectorInstances.id, connectorInstanceId),
          eq(schema.connectorInstances.projectId, projectId),
        ),
      )
      .returning({ id: schema.connectorInstances.id });
    if (updated.length === 0) throw new NotFoundException("connector not found");
  }

  async deleteConnector(
    projectId: string,
    connectorInstanceId: string,
  ): Promise<void> {
    const deleted = await this.db
      .delete(schema.connectorInstances)
      .where(
        and(
          eq(schema.connectorInstances.id, connectorInstanceId),
          eq(schema.connectorInstances.projectId, projectId),
        ),
      )
      .returning({ id: schema.connectorInstances.id });
    if (deleted.length === 0) throw new NotFoundException("connector not found");
  }

  /* --------------------------------------------------- Connector actions ---- */

  /** Load a connector instance scoped to a project, or throw. */
  private async getInstance(projectId: string, instanceId: string) {
    const [row] = await this.db
      .select({
        id: schema.connectorInstances.id,
        connectorId: schema.connectorInstances.connectorId,
        config: schema.connectorInstances.config,
        encryptedSecrets: schema.connectorInstances.encryptedSecrets,
        enabledActions: schema.connectorInstances.enabledActions,
      })
      .from(schema.connectorInstances)
      .where(
        and(
          eq(schema.connectorInstances.id, instanceId),
          eq(schema.connectorInstances.projectId, projectId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("connector not found");
    return row;
  }

  /** Set which actions are enabled (capability grants) on a connector instance. */
  async setConnectorActions(
    projectId: string,
    instanceId: string,
    actionIds: string[],
  ): Promise<void> {
    const inst = await this.getInstance(projectId, instanceId);
    const available = new Set((getConnector(inst.connectorId)?.actions ?? []).map((a) => a.id));
    const granted = [...new Set(actionIds)].filter((id) => available.has(id));
    await this.db
      .update(schema.connectorInstances)
      .set({ enabledActions: granted, updatedAt: new Date() })
      .where(eq(schema.connectorInstances.id, instanceId));
  }

  /**
   * Run a connector action. Enforces the capability grant, validates the input
   * against the action schema, decrypts secrets, executes the side effect, and
   * records a timeline event. RBAC (editor+) is enforced at the controller; the
   * request itself is captured by the audit interceptor.
   */
  async runConnectorAction(
    projectId: string,
    instanceId: string,
    actionId: string,
    input: unknown,
  ): Promise<{ ok: boolean; message?: string; data?: Record<string, unknown> }> {
    const inst = await this.getInstance(projectId, instanceId);
    const enabled = (inst.enabledActions as string[]) ?? [];
    if (!enabled.includes(actionId)) {
      throw new BadRequestException(`action "${actionId}" is not enabled for this connector`);
    }
    const connector = getConnector(inst.connectorId);
    const action = connector?.actions?.find((a) => a.id === actionId);
    if (!action) throw new BadRequestException(`unknown action "${actionId}"`);

    const parsed = action.inputSchema.safeParse(input ?? {});
    if (!parsed.success) {
      throw new BadRequestException(`invalid action input: ${parsed.error.message}`);
    }

    const [project] = await this.db
      .select({ domain: schema.projects.domain })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);

    const secrets = inst.encryptedSecrets ? decryptSecrets(inst.encryptedSecrets) : undefined;
    const now = new Date();

    let result: { ok: boolean; message?: string; data?: Record<string, unknown> };
    try {
      result = await action.run(
        {
          projectId,
          domain: project?.domain ?? "",
          config: (inst.config as Record<string, unknown>) ?? {},
          secrets,
          now,
        },
        parsed.data,
      );
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : String(err) };
    }

    // Record the action on the project timeline for visibility.
    await this.db.insert(schema.events).values({
      projectId,
      connectorId: inst.connectorId,
      severity: result.ok ? "info" : "warning",
      title: `Action: ${action.title}`,
      description: `${actionId} → ${result.ok ? "ok" : "failed"}${result.message ? `: ${result.message}` : ""}`,
      occurredAt: now,
    });

    return result;
  }

  /* -------------------------------------------------------- Alert rules ----- */

  async listAlertRules(projectId: string) {
    return this.db
      .select({
        id: schema.alertRules.id,
        metricName: schema.alertRules.metricName,
        operator: schema.alertRules.operator,
        threshold: schema.alertRules.threshold,
        severity: schema.alertRules.severity,
        cooldownSeconds: schema.alertRules.cooldownSeconds,
        enabled: schema.alertRules.enabled,
      })
      .from(schema.alertRules)
      .where(eq(schema.alertRules.projectId, projectId));
  }

  async createAlertRule(
    projectId: string,
    input: CreateAlertRuleInput,
  ): Promise<{ id: string }> {
    const [project] = await this.db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException("project not found");

    if (!input.metricName?.trim()) throw new BadRequestException("metricName is required");
    if (!OPERATORS.includes(input.operator)) {
      throw new BadRequestException(`operator must be one of: ${OPERATORS.join(", ")}`);
    }
    if (typeof input.threshold !== "number" || Number.isNaN(input.threshold)) {
      throw new BadRequestException("threshold must be a number");
    }
    const severity = input.severity ?? "warning";
    if (!SEVERITIES.includes(severity)) throw new BadRequestException("invalid severity");

    const [created] = await this.db
      .insert(schema.alertRules)
      .values({
        projectId,
        metricName: input.metricName.trim(),
        operator: input.operator,
        threshold: input.threshold,
        severity,
        cooldownSeconds: input.cooldownSeconds ?? 3600,
      })
      .returning({ id: schema.alertRules.id });
    if (!created) throw new BadRequestException("failed to create rule");
    return { id: created.id };
  }

  async deleteAlertRule(projectId: string, ruleId: string): Promise<void> {
    const deleted = await this.db
      .delete(schema.alertRules)
      .where(and(eq(schema.alertRules.id, ruleId), eq(schema.alertRules.projectId, projectId)))
      .returning({ id: schema.alertRules.id });
    if (deleted.length === 0) throw new NotFoundException("rule not found");
  }

  /* ------------------------------------------------------ Alert channels ---- */

  async listAlertChannels() {
    const orgId = await this.defaultOrgId();
    return this.db
      .select({
        id: schema.alertChannels.id,
        kind: schema.alertChannels.kind,
        config: schema.alertChannels.config,
        enabled: schema.alertChannels.enabled,
        minSeverity: schema.alertChannels.minSeverity,
        tagFilter: schema.alertChannels.tagFilter,
      })
      .from(schema.alertChannels)
      .where(eq(schema.alertChannels.organizationId, orgId));
  }

  async createAlertChannel(input: CreateAlertChannelInput): Promise<{ id: string }> {
    if (!CHANNEL_KINDS.includes(input.kind)) {
      throw new BadRequestException(`kind must be one of: ${CHANNEL_KINDS.join(", ")}`);
    }
    const minSeverity = input.minSeverity ?? "info";
    if (!SEVERITIES.includes(minSeverity)) throw new BadRequestException("invalid minSeverity");
    const orgId = await this.defaultOrgId();
    const [created] = await this.db
      .insert(schema.alertChannels)
      .values({
        organizationId: orgId,
        kind: input.kind,
        config: input.config ?? {},
        minSeverity,
        tagFilter: input.tagFilter?.trim() || null,
      })
      .returning({ id: schema.alertChannels.id });
    if (!created) throw new BadRequestException("failed to create channel");
    return { id: created.id };
  }

  async deleteAlertChannel(channelId: string): Promise<void> {
    const orgId = await this.defaultOrgId();
    const deleted = await this.db
      .delete(schema.alertChannels)
      .where(
        and(
          eq(schema.alertChannels.id, channelId),
          eq(schema.alertChannels.organizationId, orgId),
        ),
      )
      .returning({ id: schema.alertChannels.id });
    if (deleted.length === 0) throw new NotFoundException("channel not found");
  }

  /* ------------------------------------------------------------ Budgets ---- */

  async listBudgets() {
    const orgId = await this.defaultOrgId();
    return this.db
      .select({
        id: schema.budgets.id,
        scope: schema.budgets.scope,
        ref: schema.budgets.ref,
        period: schema.budgets.period,
        amount: schema.budgets.amount,
        currency: schema.budgets.currency,
      })
      .from(schema.budgets)
      .where(eq(schema.budgets.organizationId, orgId))
      .orderBy(schema.budgets.createdAt);
  }

  async createBudget(input: CreateBudgetInput): Promise<{ id: string }> {
    const SCOPES = ["project", "tag", "org"];
    const PERIODS = ["monthly", "annual"];
    if (!SCOPES.includes(input.scope)) throw new BadRequestException(`scope must be one of: ${SCOPES.join(", ")}`);
    const period = input.period ?? "monthly";
    if (!PERIODS.includes(period)) throw new BadRequestException("invalid period");
    if (typeof input.amount !== "number" || Number.isNaN(input.amount) || input.amount <= 0) {
      throw new BadRequestException("amount must be a positive number");
    }
    const currency = input.currency?.trim().toUpperCase();
    if (!currency) throw new BadRequestException("currency is required");
    const ref = input.scope === "org" ? null : input.ref?.trim() || null;
    if (input.scope !== "org" && !ref) throw new BadRequestException(`${input.scope} budget requires a ref`);

    const orgId = await this.defaultOrgId();
    const [created] = await this.db
      .insert(schema.budgets)
      .values({ organizationId: orgId, scope: input.scope, ref, period, amount: input.amount, currency })
      .returning({ id: schema.budgets.id });
    if (!created) throw new BadRequestException("failed to create budget");
    return { id: created.id };
  }

  async updateBudget(id: string, input: UpdateBudgetInput): Promise<void> {
    const orgId = await this.defaultOrgId();
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.period !== undefined) {
      if (!["monthly", "annual"].includes(input.period)) throw new BadRequestException("invalid period");
      patch.period = input.period;
    }
    if (input.amount !== undefined) {
      if (typeof input.amount !== "number" || Number.isNaN(input.amount) || input.amount <= 0) {
        throw new BadRequestException("amount must be a positive number");
      }
      patch.amount = input.amount;
    }
    if (input.currency !== undefined) {
      const cur = input.currency.trim().toUpperCase();
      if (!cur) throw new BadRequestException("currency cannot be empty");
      patch.currency = cur;
    }
    const updated = await this.db
      .update(schema.budgets)
      .set(patch)
      .where(and(eq(schema.budgets.id, id), eq(schema.budgets.organizationId, orgId)))
      .returning({ id: schema.budgets.id });
    if (updated.length === 0) throw new NotFoundException("budget not found");
  }

  async deleteBudget(id: string): Promise<void> {
    const orgId = await this.defaultOrgId();
    const deleted = await this.db
      .delete(schema.budgets)
      .where(and(eq(schema.budgets.id, id), eq(schema.budgets.organizationId, orgId)))
      .returning({ id: schema.budgets.id });
    if (deleted.length === 0) throw new NotFoundException("budget not found");
  }

  /* -------------------------------------------------- Maintenance windows --- */

  async listMaintenanceWindows() {
    const orgId = await this.defaultOrgId();
    const rows = await this.db
      .select({
        id: schema.maintenanceWindows.id,
        projectId: schema.maintenanceWindows.projectId,
        projectName: schema.projects.name,
        reason: schema.maintenanceWindows.reason,
        startsAt: schema.maintenanceWindows.startsAt,
        endsAt: schema.maintenanceWindows.endsAt,
      })
      .from(schema.maintenanceWindows)
      .leftJoin(schema.projects, eq(schema.maintenanceWindows.projectId, schema.projects.id))
      .where(eq(schema.maintenanceWindows.organizationId, orgId))
      .orderBy(schema.maintenanceWindows.startsAt);
    return rows.map((r) => ({
      ...r,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
    }));
  }

  async createMaintenanceWindow(input: CreateMaintenanceInput): Promise<{ id: string }> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException("startsAt and endsAt must be valid datetimes");
    }
    if (endsAt <= startsAt) throw new BadRequestException("endsAt must be after startsAt");
    const orgId = await this.defaultOrgId();
    const [created] = await this.db
      .insert(schema.maintenanceWindows)
      .values({
        organizationId: orgId,
        projectId: input.projectId?.trim() || null,
        reason: input.reason?.trim() || null,
        startsAt,
        endsAt,
      })
      .returning({ id: schema.maintenanceWindows.id });
    if (!created) throw new BadRequestException("failed to create maintenance window");
    return { id: created.id };
  }

  async deleteMaintenanceWindow(id: string): Promise<void> {
    const orgId = await this.defaultOrgId();
    const deleted = await this.db
      .delete(schema.maintenanceWindows)
      .where(and(eq(schema.maintenanceWindows.id, id), eq(schema.maintenanceWindows.organizationId, orgId)))
      .returning({ id: schema.maintenanceWindows.id });
    if (deleted.length === 0) throw new NotFoundException("maintenance window not found");
  }

  /* ------------------------------------------------------------ FX rates --- */

  async getFxSettings() {
    const orgId = await this.defaultOrgId();
    const [org] = await this.db
      .select({ baseCurrency: schema.organizations.baseCurrency })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);
    const rates = await this.db
      .select({ currency: schema.fxRates.currency, rateToBase: schema.fxRates.rateToBase })
      .from(schema.fxRates)
      .where(eq(schema.fxRates.organizationId, orgId))
      .orderBy(schema.fxRates.currency);
    return { baseCurrency: org?.baseCurrency ?? "USD", rates };
  }

  async setBaseCurrency(code: string): Promise<void> {
    const cur = code?.trim().toUpperCase();
    if (!cur || cur.length > 8) throw new BadRequestException("invalid currency code");
    const orgId = await this.defaultOrgId();
    await this.db
      .update(schema.organizations)
      .set({ baseCurrency: cur, updatedAt: new Date() })
      .where(eq(schema.organizations.id, orgId));
  }

  async upsertFxRate(input: UpsertFxRateInput): Promise<void> {
    const currency = input.currency?.trim().toUpperCase();
    if (!currency) throw new BadRequestException("currency is required");
    if (typeof input.rateToBase !== "number" || !(input.rateToBase > 0)) {
      throw new BadRequestException("rateToBase must be a positive number");
    }
    const orgId = await this.defaultOrgId();
    await this.db
      .insert(schema.fxRates)
      .values({ organizationId: orgId, currency, rateToBase: input.rateToBase })
      .onConflictDoUpdate({
        target: [schema.fxRates.organizationId, schema.fxRates.currency],
        set: { rateToBase: input.rateToBase, updatedAt: new Date() },
      });
  }

  async deleteFxRate(currency: string): Promise<void> {
    const orgId = await this.defaultOrgId();
    await this.db
      .delete(schema.fxRates)
      .where(
        and(
          eq(schema.fxRates.organizationId, orgId),
          eq(schema.fxRates.currency, currency.trim().toUpperCase()),
        ),
      );
  }
}
