import { and, desc, eq, isNull, lte, gte, or } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import type { NormalizedMetric } from "@webmana/contracts";
import { deliver, type AlertChannel, type AlertNotification } from "./channels.js";

/**
 * True if an active maintenance window currently covers this project (a
 * project-specific window or an org-wide one). Alerts are suppressed while a
 * window is active.
 */
async function underMaintenance(
  db: Database,
  organizationId: string,
  projectId: string,
  now: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.maintenanceWindows.id })
    .from(schema.maintenanceWindows)
    .where(
      and(
        eq(schema.maintenanceWindows.organizationId, organizationId),
        or(
          isNull(schema.maintenanceWindows.projectId),
          eq(schema.maintenanceWindows.projectId, projectId),
        ),
        lte(schema.maintenanceWindows.startsAt, now),
        gte(schema.maintenanceWindows.endsAt, now),
      ),
    )
    .limit(1);
  return !!row;
}

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

  // Skip the whole evaluation while a maintenance window is active.
  if (await underMaintenance(db, project.organizationId, projectId, now)) return;

  let channels: (AlertChannel & { minSeverity: string; tagFilter: string | null })[] | null = null;
  let projectTags = new Set<string>();

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
      domain: project.domain ?? "",
      metricName: rule.metricName,
      operator: rule.operator,
      threshold: rule.threshold,
      value: metric.value,
      severity: rule.severity,
      firedAt: now,
    };

    // Load the org's enabled channels + this project's tags lazily, once.
    if (channels === null) {
      const [rows, tagRows] = await Promise.all([
        db
          .select({
            kind: schema.alertChannels.kind,
            config: schema.alertChannels.config,
            minSeverity: schema.alertChannels.minSeverity,
            tagFilter: schema.alertChannels.tagFilter,
          })
          .from(schema.alertChannels)
          .where(
            and(
              eq(schema.alertChannels.organizationId, project.organizationId),
              eq(schema.alertChannels.enabled, true),
            ),
          ),
        db
          .select({ tag: schema.projectTags.tag })
          .from(schema.projectTags)
          .where(eq(schema.projectTags.projectId, projectId)),
      ]);
      projectTags = new Set(tagRows.map((t) => t.tag));
      channels = rows.map((r) => ({
        kind: r.kind,
        config: (r.config as Record<string, unknown>) ?? {},
        minSeverity: r.minSeverity,
        tagFilter: r.tagFilter,
      }));
    }

    const sevRank = (s: string) => (s === "critical" ? 2 : s === "warning" ? 1 : 0);

    let delivered = false;
    for (const channel of channels) {
      // Routing: respect the channel's minimum severity and tag filter.
      if (sevRank(rule.severity) < sevRank(channel.minSeverity)) continue;
      if (channel.tagFilter && !projectTags.has(channel.tagFilter)) continue;
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
