import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { getConnector, connectors } from "@webmana/connectors";
import { encryptSecrets } from "@webmana/crypto";
import { projectStatusSchema, type ProjectStatus } from "@webmana/contracts";
import { DATABASE } from "../db/db.module.js";

export interface ProjectCostInput {
  purchaseCost?: number | null;
  renewalCost?: number | null;
  costCurrency?: string | null;
  /** ISO date "YYYY-MM-DD". */
  purchaseDate?: string | null;
}

export interface CreateProjectInput extends ProjectCostInput {
  name: string;
  /** Optional — ideas/early-stage projects may not have a domain yet. */
  domain?: string;
  status?: ProjectStatus;
  description?: string;
  links?: Record<string, string>;
  tags?: string[];
}

export interface UpdateProjectInput extends ProjectCostInput {
  name?: string;
  domain?: string | null;
  status?: ProjectStatus;
  description?: string | null;
  links?: Record<string, string>;
  tags?: string[];
}

/** Normalize cost fields onto a Drizzle values/patch object. */
function applyCostFields(
  patch: Record<string, unknown>,
  input: ProjectCostInput,
  partial: boolean,
): void {
  const num = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);
  if (!partial || input.purchaseCost !== undefined) patch.purchaseCost = num(input.purchaseCost);
  if (!partial || input.renewalCost !== undefined) patch.renewalCost = num(input.renewalCost);
  if (!partial || input.costCurrency !== undefined)
    patch.costCurrency = input.costCurrency?.trim().toUpperCase() || null;
  if (!partial || input.purchaseDate !== undefined)
    patch.purchaseDate = input.purchaseDate?.trim() || null;
}

/** A domain assigned to a project, as shown in the project workspace. */
export interface ProjectDomainView {
  id: string;
  fqdn: string;
  primary: boolean;
  registrar: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  renewalCost: number | null;
  costCurrency: string | null;
}

export interface AssignDomainInput {
  /** Domain to attach. Created in the org if it does not exist yet. */
  fqdn: string;
  /** Make this the project's primary domain (drives monitoring + display). */
  primary?: boolean;
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
      purchaseCost: number | null;
      renewalCost: number | null;
      costCurrency: string | null;
      purchaseDate: string | null;
      tags: string[];
      domains: ProjectDomainView[];
      connectors: {
        id: string;
        connectorId: string;
        enabled: boolean;
        lastSyncStatus: string | null;
        lastSyncError: string | null;
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
        purchaseCost: schema.projects.purchaseCost,
        renewalCost: schema.projects.renewalCost,
        costCurrency: schema.projects.costCurrency,
        purchaseDate: schema.projects.purchaseDate,
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
          renewalCost: schema.domains.renewalCost,
          costCurrency: schema.domains.costCurrency,
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
          renewalCost: d.renewalCost,
          costCurrency: d.costCurrency,
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
    applyCostFields(values, input, false);
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
    applyCostFields(patch, input, true);

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
      })
      .from(schema.alertChannels)
      .where(eq(schema.alertChannels.organizationId, orgId));
  }

  async createAlertChannel(input: CreateAlertChannelInput): Promise<{ id: string }> {
    if (!CHANNEL_KINDS.includes(input.kind)) {
      throw new BadRequestException(`kind must be one of: ${CHANNEL_KINDS.join(", ")}`);
    }
    const orgId = await this.defaultOrgId();
    const [created] = await this.db
      .insert(schema.alertChannels)
      .values({ organizationId: orgId, kind: input.kind, config: input.config ?? {} })
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
}
