import { and, desc, eq, gte, lt } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import type { NormalizedMetric } from "@webmana/contracts";

/** Metric emitted by the AWS Cost Explorer connector. */
const COST_METRIC = "aws_cost.month_to_date";

/** Default spike threshold: flag when MTD spend exceeds last month's total by this %. */
const DEFAULT_THRESHOLD_PCT = 20;

function thresholdPct(): number {
  const raw = Number(process.env.COST_ANOMALY_THRESHOLD_PCT);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_THRESHOLD_PCT;
}

/** First day of the UTC month containing `d`. */
function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First day of the UTC month before the one containing `d`. */
function prevMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

/**
 * Flag a cost anomaly when this month's month-to-date spend already exceeds the
 * previous full month's total by more than the configured threshold. Emits at
 * most one event per project per calendar month (deduped via the events table).
 */
export async function detectCostAnomalies(
  db: Database,
  projectId: string,
  metrics: NormalizedMetric[],
  now: Date,
): Promise<void> {
  const current = metrics.find((m) => m.name === COST_METRIC);
  if (!current || current.value <= 0) return;

  const curMonthStart = monthStart(now);
  const lastMonthStart = prevMonthStart(now);

  // Previous month's total ~= the latest MTD reading recorded during that month.
  const [prev] = await db
    .select({ value: schema.metrics.value })
    .from(schema.metrics)
    .where(
      and(
        eq(schema.metrics.projectId, projectId),
        eq(schema.metrics.name, COST_METRIC),
        gte(schema.metrics.observedAt, lastMonthStart),
        lt(schema.metrics.observedAt, curMonthStart),
      ),
    )
    .orderBy(desc(schema.metrics.observedAt))
    .limit(1);

  if (!prev || prev.value <= 0) return; // no baseline yet

  const pct = thresholdPct();
  const limit = prev.value * (1 + pct / 100);
  if (current.value <= limit) return;

  // Dedup: only one cost-anomaly event per project per current month.
  const [existing] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.projectId, projectId),
        eq(schema.events.connectorId, "aws_cost"),
        eq(schema.events.title, "Cost anomaly detected"),
        gte(schema.events.occurredAt, curMonthStart),
      ),
    )
    .limit(1);
  if (existing) return;

  const overPct = Math.round((current.value / prev.value - 1) * 100);
  const unit = current.unit ? `${current.unit} ` : "";

  await db.insert(schema.events).values({
    projectId,
    connectorId: "aws_cost",
    severity: "warning",
    title: "Cost anomaly detected",
    description:
      `Month-to-date spend (${unit}${current.value.toFixed(2)}) is ${overPct}% above ` +
      `last month's total (${unit}${prev.value.toFixed(2)}), exceeding the ${pct}% threshold.`,
    occurredAt: now,
  });
}
