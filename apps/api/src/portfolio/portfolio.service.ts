import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

/**
 * Portfolio export/import for portability and backup. Excludes secrets
 * (connector credentials, passwords, token hashes) — structural data only.
 */
@Injectable()
export class PortfolioService {
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

  /** Export the org's portfolio (projects, domains, notes, budgets, FX). */
  async exportPortfolio() {
    const orgId = await this.defaultOrgId();
    const [org] = await this.db
      .select({ name: schema.organizations.name, baseCurrency: schema.organizations.baseCurrency })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    const projects = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        domain: schema.projects.domain,
        status: schema.projects.status,
        description: schema.projects.description,
        links: schema.projects.links,
      })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, orgId))
      .orderBy(asc(schema.projects.name));
    const ids = projects.map((p) => p.id);

    const [tags, domains, links, notes, budgets, fxRates] = await Promise.all([
      ids.length ? this.db.select().from(schema.projectTags).where(inArray(schema.projectTags.projectId, ids)) : [],
      this.db
        .select({
          id: schema.domains.id,
          fqdn: schema.domains.fqdn,
          registrar: schema.domains.registrar,
          expiresAt: schema.domains.expiresAt,
          autoRenew: schema.domains.autoRenew,
          purchaseCost: schema.domains.purchaseCost,
          renewalCost: schema.domains.renewalCost,
          costCurrency: schema.domains.costCurrency,
          purchaseDate: schema.domains.purchaseDate,
          notes: schema.domains.notes,
        })
        .from(schema.domains)
        .where(eq(schema.domains.organizationId, orgId)),
      ids.length
        ? this.db.select().from(schema.projectDomains).where(inArray(schema.projectDomains.projectId, ids))
        : [],
      ids.length
        ? this.db
            .select({ projectId: schema.projectNotes.projectId, body: schema.projectNotes.body, done: schema.projectNotes.done })
            .from(schema.projectNotes)
            .where(inArray(schema.projectNotes.projectId, ids))
        : [],
      this.db
        .select({ scope: schema.budgets.scope, ref: schema.budgets.ref, period: schema.budgets.period, amount: schema.budgets.amount, currency: schema.budgets.currency })
        .from(schema.budgets)
        .where(eq(schema.budgets.organizationId, orgId)),
      this.db
        .select({ currency: schema.fxRates.currency, rateToBase: schema.fxRates.rateToBase })
        .from(schema.fxRates)
        .where(eq(schema.fxRates.organizationId, orgId)),
    ]);

    const domainById = new Map(domains.map((d) => [d.id, d.fqdn]));
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      organization: { name: org?.name ?? "Webmana", baseCurrency: org?.baseCurrency ?? "USD" },
      projects: projects.map((p) => ({
        name: p.name,
        status: p.status,
        description: p.description,
        links: p.links,
        tags: tags.filter((t) => t.projectId === p.id).map((t) => t.tag),
        notes: notes.filter((n) => n.projectId === p.id).map((n) => ({ body: n.body, done: n.done })),
        // Domains by fqdn so the import can find-or-create them.
        domains: links
          .filter((l) => l.projectId === p.id)
          .map((l) => ({ fqdn: domainById.get(l.domainId), primary: l.primary }))
          .filter((d): d is { fqdn: string; primary: boolean } => !!d.fqdn),
      })),
      // Domains catalog (registry/cost), keyed by fqdn.
      domains: domains.map((d) => ({
        fqdn: d.fqdn,
        registrar: d.registrar,
        expiresAt: d.expiresAt,
        autoRenew: d.autoRenew,
        purchaseCost: d.purchaseCost,
        renewalCost: d.renewalCost,
        costCurrency: d.costCurrency,
        purchaseDate: d.purchaseDate,
        notes: d.notes,
      })),
      budgets,
      fxRates,
    };
  }

  /** Additively import a portfolio export. Creates new entities; never deletes. */
  async importPortfolio(data: any): Promise<{ projects: number; domains: number }> {
    if (!data || typeof data !== "object" || !Array.isArray(data.projects)) {
      throw new BadRequestException("invalid portfolio export");
    }
    const orgId = await this.defaultOrgId();

    if (data.organization?.baseCurrency) {
      await this.db
        .update(schema.organizations)
        .set({ baseCurrency: String(data.organization.baseCurrency).toUpperCase(), updatedAt: new Date() })
        .where(eq(schema.organizations.id, orgId));
    }

    // Upsert the domain catalog (find-or-create by fqdn), keep a fqdn→id map.
    const domainId = new Map<string, string>();
    for (const d of Array.isArray(data.domains) ? data.domains : []) {
      const fqdn = String(d.fqdn ?? "").trim().toLowerCase();
      if (!fqdn) continue;
      let [row] = await this.db
        .select({ id: schema.domains.id })
        .from(schema.domains)
        .where(and(eq(schema.domains.organizationId, orgId), eq(schema.domains.fqdn, fqdn)))
        .limit(1);
      if (!row) {
        [row] = await this.db
          .insert(schema.domains)
          .values({
            organizationId: orgId,
            fqdn,
            registrar: d.registrar ?? null,
            expiresAt: d.expiresAt ?? null,
            autoRenew: Boolean(d.autoRenew),
            purchaseCost: d.purchaseCost ?? null,
            renewalCost: d.renewalCost ?? null,
            costCurrency: d.costCurrency ?? null,
            purchaseDate: d.purchaseDate ?? null,
            notes: d.notes ?? null,
          })
          .returning({ id: schema.domains.id });
      }
      if (row) domainId.set(fqdn, row.id);
    }

    let projectCount = 0;
    for (const p of data.projects) {
      const name = String(p.name ?? "").trim();
      if (!name) continue;
      const [created] = await this.db
        .insert(schema.projects)
        .values({
          organizationId: orgId,
          name,
          domain: null,
          status: p.status ?? "idea",
          description: p.description ?? null,
          links: p.links ?? {},
        })
        .returning({ id: schema.projects.id });
      if (!created) continue;
      projectCount += 1;

      const tags: string[] = Array.isArray(p.tags) ? p.tags : [];
      if (tags.length) {
        await this.db.insert(schema.projectTags).values(tags.map((tag: string) => ({ projectId: created.id, tag })));
      }
      const notes = Array.isArray(p.notes) ? p.notes : [];
      if (notes.length) {
        await this.db
          .insert(schema.projectNotes)
          .values(notes.map((n: any) => ({ projectId: created.id, body: String(n.body ?? ""), done: Boolean(n.done) })));
      }
      for (const link of Array.isArray(p.domains) ? p.domains : []) {
        const fqdn = String(link.fqdn ?? "").trim().toLowerCase();
        let did = domainId.get(fqdn);
        if (!did && fqdn) {
          const [row] = await this.db
            .insert(schema.domains)
            .values({ organizationId: orgId, fqdn })
            .onConflictDoNothing()
            .returning({ id: schema.domains.id });
          did = row?.id;
        }
        if (did) {
          await this.db
            .insert(schema.projectDomains)
            .values({ projectId: created.id, domainId: did, primary: Boolean(link.primary) })
            .onConflictDoNothing();
          if (link.primary) {
            await this.db
              .update(schema.projects)
              .set({ domain: fqdn })
              .where(eq(schema.projects.id, created.id));
          }
        }
      }
    }

    // Budgets + FX (org-scoped). Project-scoped budgets are skipped (ids changed).
    for (const b of Array.isArray(data.budgets) ? data.budgets : []) {
      if (b.scope === "project") continue;
      await this.db.insert(schema.budgets).values({
        organizationId: orgId,
        scope: b.scope,
        ref: b.ref ?? null,
        period: b.period ?? "monthly",
        amount: Number(b.amount),
        currency: String(b.currency ?? "USD").toUpperCase(),
      });
    }
    for (const r of Array.isArray(data.fxRates) ? data.fxRates : []) {
      await this.db
        .insert(schema.fxRates)
        .values({ organizationId: orgId, currency: String(r.currency).toUpperCase(), rateToBase: Number(r.rateToBase) })
        .onConflictDoUpdate({
          target: [schema.fxRates.organizationId, schema.fxRates.currency],
          set: { rateToBase: Number(r.rateToBase), updatedAt: new Date() },
        });
    }

    return { projects: projectCount, domains: domainId.size };
  }
}
