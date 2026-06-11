import { Inject, Injectable } from "@nestjs/common";
import { asc, desc, eq } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Latest "aws_cost.month_to_date" sample counts as cloud spend if this recent. */
const CLOUD_FRESH_MS = 3 * DAY_MS;
/** Latest "revenue.mrr" sample counts as current revenue if this recent. */
const REVENUE_FRESH_MS = 8 * DAY_MS;

export interface CurrencyTotal {
  currency: string;
  total: number;
  /** Number of line items contributing to this currency total. */
  items: number;
}

export interface CostLine {
  kind: "domain" | "project" | "cloud";
  label: string;
  /** Linked project id, when applicable. */
  projectId: string | null;
  amount: number;
  currency: string;
  /** "renewal/yr", "month-to-date", etc. */
  period: string;
}

export interface UpcomingRenewal {
  domainId: string;
  fqdn: string;
  expiresAt: string;
  daysUntil: number;
  autoRenew: boolean;
  renewalCost: number | null;
  currency: string | null;
}

/** Annualized revenue vs cost for one project, with margin. */
export interface ProjectProfit {
  projectId: string;
  name: string;
  currency: string;
  annualRevenue: number;
  annualCost: number;
  margin: number;
}

/** A budget with its annualized target and actual spend. */
export interface BudgetStatus {
  id: string;
  scope: "project" | "tag" | "org";
  ref: string | null;
  label: string;
  period: "monthly" | "annual";
  amount: number;
  currency: string;
  /** Budget normalized to an annual figure (monthly × 12). */
  annualBudget: number;
  /** Annualized actual cost in scope (domains + cloud run-rate). */
  annualActual: number;
  /** annualActual / annualBudget as a percentage. */
  pctUsed: number;
}

export interface FinanceReport {
  generatedAt: string;
  /** Sum of recurring annual renewals (domains + projects), per currency. */
  annualByCurrency: CurrencyTotal[];
  /** Latest cloud month-to-date spend, per currency. */
  cloudByCurrency: CurrencyTotal[];
  /** Current monthly recurring revenue, per currency. */
  mrrByCurrency: CurrencyTotal[];
  /** Domain renewals coming up within the next 90 days. */
  upcomingRenewals: UpcomingRenewal[];
  /** Per-project annualized revenue vs cost (worst margin first). */
  profitability: ProjectProfit[];
  /** Budgets with target vs actual (most-over first). */
  budgets: BudgetStatus[];
  /** Flat list of every cost line, for the breakdown table. */
  lines: CostLine[];
}

@Injectable()
export class FinanceService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private addTo(map: Map<string, CurrencyTotal>, currency: string, amount: number): void {
    const cur = currency || "?";
    const e = map.get(cur) ?? { currency: cur, total: 0, items: 0 };
    e.total = Math.round((e.total + amount) * 100) / 100;
    e.items += 1;
    map.set(cur, e);
  }

  async report(): Promise<FinanceReport> {
    const now = Date.now();
    const annual = new Map<string, CurrencyTotal>();
    const cloud = new Map<string, CurrencyTotal>();
    const mrr = new Map<string, CurrencyTotal>();
    const lines: CostLine[] = [];
    /** Per-project annual cost/revenue accumulators for the profitability table. */
    const cloudByProject = new Map<string, { amount: number; currency: string }>();
    const domainCostByProject = new Map<string, { amount: number; currency: string }>();
    const revenueByProject = new Map<string, { mrr: number; currency: string }>();

    // --- Domain renewals ---
    const domainRows = await this.db
      .select({
        id: schema.domains.id,
        fqdn: schema.domains.fqdn,
        expiresAt: schema.domains.expiresAt,
        autoRenew: schema.domains.autoRenew,
        renewalCost: schema.domains.renewalCost,
        costCurrency: schema.domains.costCurrency,
      })
      .from(schema.domains)
      .orderBy(asc(schema.domains.expiresAt));

    const upcomingRenewals: UpcomingRenewal[] = [];
    for (const d of domainRows) {
      if (d.renewalCost != null) {
        const cur = d.costCurrency ?? "?";
        this.addTo(annual, cur, d.renewalCost);
        lines.push({
          kind: "domain",
          label: d.fqdn,
          projectId: null,
          amount: d.renewalCost,
          currency: cur,
          period: "renewal/yr",
        });
      }
      if (d.expiresAt) {
        const daysUntil = Math.ceil((new Date(`${d.expiresAt}T00:00:00Z`).getTime() - now) / DAY_MS);
        if (daysUntil <= 90) {
          upcomingRenewals.push({
            domainId: d.id,
            fqdn: d.fqdn,
            expiresAt: d.expiresAt,
            daysUntil,
            autoRenew: d.autoRenew,
            renewalCost: d.renewalCost,
            currency: d.costCurrency,
          });
        }
      }
    }

    // --- Per-project domain renewal cost (for profitability) ---
    const linkRows = await this.db
      .select({
        projectId: schema.projectDomains.projectId,
        renewalCost: schema.domains.renewalCost,
        costCurrency: schema.domains.costCurrency,
      })
      .from(schema.projectDomains)
      .innerJoin(schema.domains, eq(schema.projectDomains.domainId, schema.domains.id));
    for (const l of linkRows) {
      if (l.renewalCost == null) continue;
      const e = domainCostByProject.get(l.projectId) ?? { amount: 0, currency: l.costCurrency ?? "?" };
      e.amount = Math.round((e.amount + l.renewalCost) * 100) / 100;
      domainCostByProject.set(l.projectId, e);
    }

    // --- Cloud spend: latest aws_cost.month_to_date per project ---
    const costRows = await this.db
      .select({
        projectId: schema.metrics.projectId,
        value: schema.metrics.value,
        unit: schema.metrics.unit,
        observedAt: schema.metrics.observedAt,
      })
      .from(schema.metrics)
      .where(eq(schema.metrics.name, "aws_cost.month_to_date"))
      .orderBy(desc(schema.metrics.observedAt));

    const projectNames = new Map(
      (await this.db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects)).map(
        (p) => [p.id, p.name] as const,
      ),
    );

    const seenCloud = new Set<string>();
    for (const c of costRows) {
      if (seenCloud.has(c.projectId)) continue; // newest per project only
      seenCloud.add(c.projectId);
      if (now - c.observedAt.getTime() > CLOUD_FRESH_MS) continue; // stale
      const cur = c.unit ?? "USD";
      this.addTo(cloud, cur, c.value);
      // Annualize month-to-date as a rough run-rate for profitability.
      cloudByProject.set(c.projectId, { amount: Math.round(c.value * 12 * 100) / 100, currency: cur });
      lines.push({
        kind: "cloud",
        label: `${projectNames.get(c.projectId) ?? "Cloud"} (AWS)`,
        projectId: c.projectId,
        amount: Math.round(c.value * 100) / 100,
        currency: cur,
        period: "month-to-date",
      });
    }

    // --- Revenue: latest revenue.mrr per project ---
    const revRows = await this.db
      .select({
        projectId: schema.metrics.projectId,
        value: schema.metrics.value,
        unit: schema.metrics.unit,
        observedAt: schema.metrics.observedAt,
      })
      .from(schema.metrics)
      .where(eq(schema.metrics.name, "revenue.mrr"))
      .orderBy(desc(schema.metrics.observedAt));

    const seenRev = new Set<string>();
    for (const r of revRows) {
      if (seenRev.has(r.projectId)) continue; // newest per project only
      seenRev.add(r.projectId);
      if (now - r.observedAt.getTime() > REVENUE_FRESH_MS) continue; // stale
      const cur = r.unit ?? "?";
      this.addTo(mrr, cur, r.value);
      revenueByProject.set(r.projectId, { mrr: r.value, currency: cur });
    }

    // --- Profitability: annualized revenue vs cost per project ---
    const profitIds = new Set<string>([
      ...revenueByProject.keys(),
      ...domainCostByProject.keys(),
      ...cloudByProject.keys(),
    ]);
    const profitability: ProjectProfit[] = [];
    for (const pid of profitIds) {
      const rev = revenueByProject.get(pid);
      const dom = domainCostByProject.get(pid);
      const cl = cloudByProject.get(pid);
      const annualRevenue = rev ? Math.round(rev.mrr * 12 * 100) / 100 : 0;
      const annualCost = Math.round(((dom?.amount ?? 0) + (cl?.amount ?? 0)) * 100) / 100;
      const currency = rev?.currency ?? dom?.currency ?? cl?.currency ?? "?";
      profitability.push({
        projectId: pid,
        name: projectNames.get(pid) ?? "—",
        currency,
        annualRevenue,
        annualCost,
        margin: Math.round((annualRevenue - annualCost) * 100) / 100,
      });
    }
    // Worst margin first so loss-makers surface at the top.
    profitability.sort((a, b) => a.margin - b.margin);

    // --- Budgets: target vs annualized actual cost ---
    const annualCostByProject = (pid: string): number =>
      Math.round(((domainCostByProject.get(pid)?.amount ?? 0) + (cloudByProject.get(pid)?.amount ?? 0)) * 100) / 100;

    const [org] = await this.db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .orderBy(asc(schema.organizations.createdAt))
      .limit(1);

    const budgets: BudgetStatus[] = [];
    if (org) {
      const [budgetRows, tagRows] = await Promise.all([
        this.db
          .select({
            id: schema.budgets.id,
            scope: schema.budgets.scope,
            ref: schema.budgets.ref,
            period: schema.budgets.period,
            amount: schema.budgets.amount,
            currency: schema.budgets.currency,
          })
          .from(schema.budgets)
          .where(eq(schema.budgets.organizationId, org.id)),
        this.db
          .select({ projectId: schema.projectTags.projectId, tag: schema.projectTags.tag })
          .from(schema.projectTags),
      ]);

      const allProjectIds = [...projectNames.keys()];
      const totalAnnualCost = allProjectIds.reduce((sum, pid) => sum + annualCostByProject(pid), 0);

      for (const b of budgetRows) {
        let annualActual = 0;
        let label: string;
        if (b.scope === "org") {
          annualActual = totalAnnualCost;
          label = "Organization";
        } else if (b.scope === "project") {
          annualActual = annualCostByProject(b.ref ?? "");
          label = projectNames.get(b.ref ?? "") ?? "Unknown project";
        } else {
          const ids = tagRows.filter((t) => t.tag === b.ref).map((t) => t.projectId);
          annualActual = ids.reduce((sum, pid) => sum + annualCostByProject(pid), 0);
          label = `#${b.ref}`;
        }
        annualActual = Math.round(annualActual * 100) / 100;
        const annualBudget = Math.round((b.period === "monthly" ? b.amount * 12 : b.amount) * 100) / 100;
        budgets.push({
          id: b.id,
          scope: b.scope,
          ref: b.ref,
          label,
          period: b.period,
          amount: b.amount,
          currency: b.currency,
          annualBudget,
          annualActual,
          pctUsed: annualBudget > 0 ? Math.round((annualActual / annualBudget) * 100) : 0,
        });
      }
      budgets.sort((a, b) => b.pctUsed - a.pctUsed);
    }

    upcomingRenewals.sort((a, b) => a.daysUntil - b.daysUntil);

    return {
      generatedAt: new Date().toISOString(),
      annualByCurrency: [...annual.values()].sort((a, b) => b.total - a.total),
      cloudByCurrency: [...cloud.values()].sort((a, b) => b.total - a.total),
      mrrByCurrency: [...mrr.values()].sort((a, b) => b.total - a.total),
      upcomingRenewals,
      profitability,
      budgets,
      lines: lines.sort((a, b) => b.amount - a.amount),
    };
  }
}
