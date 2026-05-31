import { and, desc, eq } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import type { NormalizedMetric } from "@webmana/contracts";
import { deliver, type AlertChannel, type AlertNotification } from "./channels.js";

function breached(operator: string, value: number, threshold: number): boolean {
  switch (operator) {
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "eq":
      return value === threshold;
    default:
      return false;
  }
}

/**
 * Evaluate a project's enabled alert rules against the metrics produced by a
 * sync. Fired rules respect a per-rule cooldown, are recorded in alert_history,
 * surface as a timeline event, and are delivered to the org's channels.
 */
export async function evaluateAlerts(
  db: Database,
  projectId: string,
  metrics: NormalizedMetric[],
  now: Date,
): Promise<void> {
  const rules = await db
    .select()
    .from(schema.alertRules)
    .where(
      and(
        eq(schema.alertRules.projectId, projectId),
        eq(schema.alertRules.enabled, true),
      ),
    );
  if (rules.length === 0) return;

  const [project] = await db
    .select({
      name: schema.projects.name,
      domain: schema.projects.domain,
      organizationId: schema.projects.organizationId,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) return;

  let channels: AlertChannel[] | null = null;

  for (const rule of rules) {
    const metric = metrics.find((m) => m.name === rule.metricName);
    if (!metric || !breached(rule.operator, metric.value, rule.threshold)) continue;

    // Cooldown / dedup: skip if this rule fired within its cooldown window.
    const [last] = await db
      .select({ firedAt: schema.alertHistory.firedAt })
      .from(schema.alertHistory)
      .where(eq(schema.alertHistory.ruleId, rule.id))
      .orderBy(desc(schema.alertHistory.firedAt))
      .limit(1);
    if (last && now.getTime() - last.firedAt.getTime() < rule.cooldownSeconds * 1000) {
      continue;
    }

    const notification: AlertNotification = {
      projectId,
      projectName: project.name,
      domain: project.domain,
      metricName: rule.metricName,
      operator: rule.operator,
      threshold: rule.threshold,
      value: metric.value,
      severity: rule.severity,
      firedAt: now,
    };

    // Load the org's enabled channels lazily, once per evaluation.
    if (channels === null) {
      const rows = await db
        .select({
          kind: schema.alertChannels.kind,
          config: schema.alertChannels.config,
        })
        .from(schema.alertChannels)
        .where(
          and(
            eq(schema.alertChannels.organizationId, project.organizationId),
            eq(schema.alertChannels.enabled, true),
          ),
        );
      channels = rows.map((r) => ({
        kind: r.kind,
        config: (r.config as Record<string, unknown>) ?? {},
      }));
    }

    let delivered = false;
    for (const channel of channels) {
      try {
        await deliver(channel, notification);
        delivered = true;
      } catch (err) {
        console.error(
          `[alerts] delivery to ${channel.kind} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    await db.insert(schema.alertHistory).values({
      ruleId: rule.id,
      firedAt: now,
      value: metric.value,
      delivered,
    });

    await db.insert(schema.events).values({
      projectId,
      connectorId: metric.connectorId,
      severity: rule.severity,
      title: `Alert: ${rule.metricName}`,
      description: `${rule.metricName} = ${metric.value} breached threshold ${rule.operator} ${rule.threshold}`,
      occurredAt: now,
    });
  }
}
