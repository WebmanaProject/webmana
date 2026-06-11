import { and, eq, isNull, lt } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { deliver, type AlertChannel, type AlertNotification } from "./channels.js";

const MINUTE_MS = 60_000;

/** Minutes an incident may stay open+unacknowledged before escalating. */
export function escalationMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.ALERT_ESCALATION_MINUTES ?? "30", 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** How often the worker checks for stale incidents. */
export function escalationIntervalMs(): number {
  return 5 * MINUTE_MS;
}

/**
 * Find incidents that have been open and unacknowledged past the threshold and
 * have not been escalated yet; notify the org's channels once and stamp
 * escalatedAt. Returns the number escalated.
 */
export async function escalateStaleIncidents(db: Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - escalationMinutes() * MINUTE_MS);

  const stale = await db
    .select({
      id: schema.incidents.id,
      organizationId: schema.incidents.organizationId,
      projectId: schema.incidents.projectId,
      title: schema.incidents.title,
      severity: schema.incidents.severity,
    })
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.status, "open"),
        isNull(schema.incidents.acknowledgedAt),
        isNull(schema.incidents.escalatedAt),
        lt(schema.incidents.createdAt, cutoff),
      ),
    );
  if (stale.length === 0) return 0;

  // Cache channels per org across this run.
  const channelsByOrg = new Map<string, AlertChannel[]>();
  let escalated = 0;

  for (const inc of stale) {
    let channels = channelsByOrg.get(inc.organizationId);
    if (!channels) {
      const rows = await db
        .select({ kind: schema.alertChannels.kind, config: schema.alertChannels.config })
        .from(schema.alertChannels)
        .where(
          and(
            eq(schema.alertChannels.organizationId, inc.organizationId),
            eq(schema.alertChannels.enabled, true),
          ),
        );
      channels = rows.map((r) => ({ kind: r.kind, config: (r.config as Record<string, unknown>) ?? {} }));
      channelsByOrg.set(inc.organizationId, channels);
    }

    const notification: AlertNotification = {
      projectId: inc.projectId ?? "",
      projectName: inc.title,
      domain: "",
      metricName: `incident unacknowledged ${escalationMinutes()}m`,
      operator: "gte",
      threshold: escalationMinutes(),
      value: escalationMinutes(),
      severity: inc.severity,
      firedAt: now,
    };
    for (const channel of channels) {
      try {
        await deliver(channel, notification);
      } catch (err) {
        console.error("[escalation] delivery failed:", err instanceof Error ? err.message : String(err));
      }
    }

    await db
      .update(schema.incidents)
      .set({ escalatedAt: now, updatedAt: now })
      .where(eq(schema.incidents.id, inc.id));
    escalated += 1;
  }
  return escalated;
}
