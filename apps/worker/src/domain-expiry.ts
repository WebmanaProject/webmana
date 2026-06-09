import { and, eq, gte, lte } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";

/** Warn when a domain expires within these day thresholds (descending). */
const THRESHOLDS = [60, 30, 7];
const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(date: string, now: Date): number {
  return Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - now.getTime()) / DAY_MS);
}

/**
 * Emit renewal-warning events for domains nearing expiry. The event lands on
 * each linked project (events are project-scoped). Deduped: at most one event
 * per domain per threshold bucket per day. Domains with auto-renew on or with
 * no expiry date / no linked project are skipped.
 */
export async function checkDomainExpiry(db: Database, now: Date): Promise<number> {
  const rows = await db
    .select({
      id: schema.domains.id,
      fqdn: schema.domains.fqdn,
      expiresAt: schema.domains.expiresAt,
      autoRenew: schema.domains.autoRenew,
    })
    .from(schema.domains);

  let emitted = 0;
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (const d of rows) {
    if (!d.expiresAt || d.autoRenew) continue;
    const days = daysUntil(d.expiresAt, now);
    // Smallest threshold the domain currently falls under (e.g. 5 days -> 7).
    const bucket = THRESHOLDS.filter((t) => days <= t).sort((a, b) => a - b)[0];
    if (bucket === undefined) continue;

    const projects = await db
      .select({ projectId: schema.projectDomains.projectId })
      .from(schema.projectDomains)
      .where(eq(schema.projectDomains.domainId, d.id));
    if (projects.length === 0) continue;

    const severity = days <= 7 ? "critical" : "warning";
    const title = `Domain ${d.fqdn} expires in ${days} day(s)`;

    for (const { projectId } of projects) {
      // Dedup: skip if an identical event was already recorded today.
      const [existing] = await db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.projectId, projectId),
            eq(schema.events.title, title),
            gte(schema.events.occurredAt, dayStart),
            lte(schema.events.occurredAt, now),
          ),
        )
        .limit(1);
      if (existing) continue;

      await db.insert(schema.events).values({
        projectId,
        connectorId: null,
        severity,
        title,
        description:
          days < 0
            ? `Domain expired ${Math.abs(days)} day(s) ago. Renew immediately.`
            : `Renew before ${d.expiresAt} (threshold ${bucket} days).`,
        occurredAt: now,
      });
      emitted += 1;
    }
  }
  return emitted;
}
