import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DomainInput {
  fqdn?: string;
  registrar?: string | null;
  expiresAt?: string | null;
  autoRenew?: boolean;
  nameservers?: string[];
  locked?: boolean;
  purchaseCost?: number | null;
  renewalCost?: number | null;
  costCurrency?: string | null;
  purchaseDate?: string | null;
  notes?: string | null;
}

export interface DomainView {
  id: string;
  fqdn: string;
  registrar: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  autoRenew: boolean;
  nameservers: string[];
  locked: boolean;
  purchaseCost: number | null;
  renewalCost: number | null;
  costCurrency: string | null;
  purchaseDate: string | null;
  notes: string | null;
  projects: { id: string; name: string; primary: boolean }[];
}

@Injectable()
export class DomainsService {
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

  private daysUntil(date: string | null): number | null {
    if (!date) return null;
    const ms = new Date(`${date}T00:00:00Z`).getTime() - Date.now();
    return Math.ceil(ms / DAY_MS);
  }

  /** All domains in the org with days-until-expiry and linked projects. */
  async list(): Promise<DomainView[]> {
    const orgId = await this.defaultOrgId();
    const rows = await this.db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.organizationId, orgId))
      .orderBy(asc(schema.domains.expiresAt));

    const ids = rows.map((d) => d.id);
    const links = ids.length
      ? await this.db
          .select({
            domainId: schema.projectDomains.domainId,
            projectId: schema.projectDomains.projectId,
            primary: schema.projectDomains.primary,
            name: schema.projects.name,
          })
          .from(schema.projectDomains)
          .innerJoin(schema.projects, eq(schema.projectDomains.projectId, schema.projects.id))
          .where(inArray(schema.projectDomains.domainId, ids))
      : [];

    return rows.map((d) => ({
      id: d.id,
      fqdn: d.fqdn,
      registrar: d.registrar,
      expiresAt: d.expiresAt,
      daysUntilExpiry: this.daysUntil(d.expiresAt),
      autoRenew: d.autoRenew,
      nameservers: (d.nameservers as string[]) ?? [],
      locked: d.locked,
      purchaseCost: d.purchaseCost,
      renewalCost: d.renewalCost,
      costCurrency: d.costCurrency,
      purchaseDate: d.purchaseDate,
      notes: d.notes,
      projects: links
        .filter((l) => l.domainId === d.id)
        .map((l) => ({ id: l.projectId, name: l.name, primary: l.primary })),
    }));
  }

  private normalize(input: DomainInput): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (input.fqdn !== undefined) {
      const fqdn = input.fqdn.trim().toLowerCase();
      if (!fqdn) throw new BadRequestException("fqdn is required");
      patch.fqdn = fqdn;
    }
    if (input.registrar !== undefined) patch.registrar = input.registrar?.trim() || null;
    if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt?.trim() || null;
    if (input.autoRenew !== undefined) patch.autoRenew = Boolean(input.autoRenew);
    if (input.nameservers !== undefined) {
      patch.nameservers = (input.nameservers ?? [])
        .map((n) => n.trim().toLowerCase())
        .filter(Boolean);
    }
    if (input.locked !== undefined) patch.locked = Boolean(input.locked);
    const num = (v: number | null | undefined) =>
      v == null || Number.isNaN(Number(v)) ? null : Number(v);
    if (input.purchaseCost !== undefined) patch.purchaseCost = num(input.purchaseCost);
    if (input.renewalCost !== undefined) patch.renewalCost = num(input.renewalCost);
    if (input.costCurrency !== undefined)
      patch.costCurrency = input.costCurrency?.trim().toUpperCase() || null;
    if (input.purchaseDate !== undefined) patch.purchaseDate = input.purchaseDate?.trim() || null;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    return patch;
  }

  async create(input: DomainInput): Promise<{ id: string }> {
    if (!input.fqdn?.trim()) throw new BadRequestException("fqdn is required");
    const organizationId = await this.defaultOrgId();
    const values = { organizationId, ...this.normalize(input) };
    const [created] = await this.db
      .insert(schema.domains)
      .values(values as typeof schema.domains.$inferInsert)
      .returning({ id: schema.domains.id });
    if (!created) throw new BadRequestException("failed to create domain");
    return { id: created.id };
  }

  async update(id: string, input: DomainInput): Promise<void> {
    const orgId = await this.defaultOrgId();
    const patch = { ...this.normalize(input), updatedAt: new Date() };
    const updated = await this.db
      .update(schema.domains)
      .set(patch)
      .where(and(eq(schema.domains.id, id), eq(schema.domains.organizationId, orgId)))
      .returning({ id: schema.domains.id });
    if (updated.length === 0) throw new NotFoundException("domain not found");
  }

  async remove(id: string): Promise<void> {
    const orgId = await this.defaultOrgId();
    const deleted = await this.db
      .delete(schema.domains)
      .where(and(eq(schema.domains.id, id), eq(schema.domains.organizationId, orgId)))
      .returning({ id: schema.domains.id });
    if (deleted.length === 0) throw new NotFoundException("domain not found");
  }

  /** Link a domain to a project (optionally as its primary domain). */
  async linkProject(domainId: string, projectId: string, primary = false): Promise<void> {
    const orgId = await this.defaultOrgId();
    const [domain] = await this.db
      .select({ id: schema.domains.id })
      .from(schema.domains)
      .where(and(eq(schema.domains.id, domainId), eq(schema.domains.organizationId, orgId)))
      .limit(1);
    if (!domain) throw new NotFoundException("domain not found");

    await this.db
      .insert(schema.projectDomains)
      .values({ projectId, domainId, primary })
      .onConflictDoUpdate({
        target: [schema.projectDomains.projectId, schema.projectDomains.domainId],
        set: { primary },
      });
  }

  async unlinkProject(domainId: string, projectId: string): Promise<void> {
    await this.db
      .delete(schema.projectDomains)
      .where(
        and(
          eq(schema.projectDomains.domainId, domainId),
          eq(schema.projectDomains.projectId, projectId),
        ),
      );
  }
}
