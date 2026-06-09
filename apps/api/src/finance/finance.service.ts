import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Latest "aws_cost.month_to_date" sample counts as cloud spend if this recent. */
const CLOUD_FRESH_MS = 3 * DAY_MS;

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

export interface FinanceReport {
  generatedAt: string;
  /** Sum of recurring annual renewals (domains + projects), per currency. */
  annualByCurrency: CurrencyTotal[];
  /** Latest cloud month-to-date spend, per currency. */
  cloudByCurrency: CurrencyTotal[];
  /** Domain renewals coming up within the next 90 days. */
  upcomingRenewals: UpcomingRenewal[];
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
    const lines: CostLine[] = [];

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

    // --- Project renewals (manual) ---
    const projectRows = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        renewalCost: schema.projects.renewalCost,
        costCurrency: schema.projects.costCurrency,
      })
      .from(schema.projects)
      .where(isNotNull(schema.projects.renewalCost));

    for (const p of projectRows) {
      if (p.renewalCost == null) continue;
      const cur = p.costCurrency ?? "?";
      this.addTo(annual, cur, p.renewalCost);
      lines.push({
        kind: "project",
        label: p.name,
        projectId: p.id,
        amount: p.renewalCost,
        currency: cur,
        period: "renewal/yr",
      });
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
      (
        await this.db
          .select({ id: schema.projects.id, name: schema.projects.name })
          .from(schema.projects)
          .where(
            inArray(
              schema.projects.id,
              costRows.length ? [...new Set(costRows.map((c) => c.projectId))] : ["00000000-0000-0000-0000-000000000000"],
            ),
          )
      ).map((p) => [p.id, p.name]),
    );

    const seenCloud = new Set<string>();
    for (const c of costRows) {
      if (seenCloud.has(c.projectId)) continue; // newest per project only
      seenCloud.add(c.projectId);
      if (now - c.observedAt.getTime() > CLOUD_FRESH_MS) continue; // stale
      const cur = c.unit ?? "USD";
      this.addTo(cloud, cur, c.value);
      lines.push({
        kind: "cloud",
        label: `${projectNames.get(c.projectId) ?? "Cloud"} (AWS)`,
        projectId: c.projectId,
        amount: Math.round(c.value * 100) / 100,
        currency: cur,
        period: "month-to-date",
      });
    }

    upcomingRenewals.sort((a, b) => a.daysUntil - b.daysUntil);

    return {
      generatedAt: new Date().toISOString(),
      annualByCurrency: [...annual.values()].sort((a, b) => b.total - a.total),
      cloudByCurrency: [...cloud.values()].sort((a, b) => b.total - a.total),
      upcomingRenewals,
      lines: lines.sort((a, b) => b.amount - a.amount),
    };
  }
}
