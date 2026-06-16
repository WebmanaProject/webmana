import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { createDatabase, schema } from "@webmana/db";
import { MONITORED_STATUSES } from "@webmana/contracts";
import {
  getConnector,
  loadExternalConnectors,
  type ConnectorRunContext,
} from "@webmana/connectors";
import { decryptSecrets } from "@webmana/crypto";
import { evaluateAlerts } from "./alerts.js";
import { detectCostAnomalies } from "./cost-anomaly.js";
import { generateInsights, insightsIntervalMs } from "./insights.js";
import { sendWeeklyDigest, digestIntervalMs } from "./digest.js";
import { escalateStaleIncidents, escalationIntervalMs } from "./escalation.js";
import { checkDomainExpiry } from "./domain-expiry.js";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const db = createDatabase(
  process.env.DATABASE_URL ?? "postgres://webmana:webmana@localhost:5432/webmana",
);

const QUEUE_NAME = "connector-sync";
const SCAN_INTERVAL_MS = 60_000;

export const syncQueue = new Queue(QUEUE_NAME, { connection });

/** Enqueue a sync job for every enabled connector instance that is due. */
async function scan(): Promise<number> {
  // Only poll connectors for projects that are actually deployed (live/rebuild)
  // and have a domain. Ideas / in-progress / paused / archived are skipped so
  // they never produce false alerts.
  const instances = await db
    .select({
      id: schema.connectorInstances.id,
      connectorId: schema.connectorInstances.connectorId,
      lastSyncAt: schema.connectorInstances.lastSyncAt,
    })
    .from(schema.connectorInstances)
    .innerJoin(schema.projects, eq(schema.connectorInstances.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.connectorInstances.enabled, true),
        isNotNull(schema.projects.domain),
        inArray(schema.projects.status, MONITORED_STATUSES),
      ),
    );

  const now = Date.now();
  let enqueued = 0;

  for (const instance of instances) {
    const connector = getConnector(instance.connectorId);
    if (!connector) continue;

    const dueAt =
      (instance.lastSyncAt?.getTime() ?? 0) + connector.defaultIntervalSeconds * 1000;
    if (instance.lastSyncAt && now < dueAt) continue;

    await syncQueue.add(
      "sync",
      { connectorInstanceId: instance.id },
      { jobId: `sync-${instance.id}`, removeOnComplete: true, removeOnFail: 100 },
    );
    enqueued += 1;
  }
  return enqueued;
}

/** Run one connector instance: fetch, normalize, persist, record status. */
async function runSync(connectorInstanceId: string): Promise<void> {
  const [row] = await db
    .select({
      id: schema.connectorInstances.id,
      connectorId: schema.connectorInstances.connectorId,
      config: schema.connectorInstances.config,
      encryptedSecrets: schema.connectorInstances.encryptedSecrets,
      projectId: schema.connectorInstances.projectId,
      domain: schema.projects.domain,
    })
    .from(schema.connectorInstances)
    .innerJoin(schema.projects, eq(schema.connectorInstances.projectId, schema.projects.id))
    .where(eq(schema.connectorInstances.id, connectorInstanceId))
    .limit(1);

  if (!row) return;

  const connector = getConnector(row.connectorId);
  const now = new Date();

  if (!connector) {
    await db
      .update(schema.connectorInstances)
      .set({
        lastSyncStatus: "error",
        lastSyncAt: now,
        lastSyncError: `Unknown connector "${row.connectorId}"`,
        updatedAt: now,
      })
      .where(eq(schema.connectorInstances.id, row.id));
    return;
  }

  await db
    .update(schema.connectorInstances)
    .set({ lastSyncStatus: "running", updatedAt: now })
    .where(eq(schema.connectorInstances.id, row.id));

  try {
    const secrets = row.encryptedSecrets
      ? decryptSecrets(row.encryptedSecrets)
      : undefined;

    const ctx: ConnectorRunContext = {
      projectId: row.projectId,
      // scan() only enqueues projects that have a domain; fall back defensively.
      domain: row.domain ?? "",
      config: (row.config as Record<string, unknown>) ?? {},
      secrets,
      now,
    };

    const raw = await connector.fetch(ctx);
    const { metrics, events } = connector.normalize(raw, ctx);

    if (metrics.length > 0) {
      await db.insert(schema.metrics).values(
        metrics.map((m) => ({
          projectId: m.projectId,
          connectorId: m.connectorId,
          kind: m.kind,
          name: m.name,
          value: m.value,
          unit: m.unit,
          labels: m.labels,
          observedAt: m.observedAt,
        })),
      );
    }

    if (events.length > 0) {
      await db.insert(schema.events).values(
        events.map((e) => ({
          projectId: e.projectId,
          connectorId: e.connectorId,
          severity: e.severity,
          title: e.title,
          description: e.description,
          occurredAt: e.occurredAt,
        })),
      );
    }

    await detectCostAnomalies(db, row.projectId, metrics, now);
    await evaluateAlerts(db, row.projectId, metrics, now);

    await db
      .update(schema.connectorInstances)
      .set({
        lastSyncStatus: "ok",
        lastSyncAt: new Date(),
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.connectorInstances.id, row.id));
  } catch (err) {
    await db
      .update(schema.connectorInstances)
      .set({
        lastSyncStatus: "error",
        lastSyncAt: new Date(),
        lastSyncError: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(schema.connectorInstances.id, row.id));
    throw err;
  }
}

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    if (job.name === "scan") {
      const n = await scan();
      console.log(`[worker] scan enqueued ${n} job(s)`);
      return;
    }
    if (job.name === "sync") {
      await runSync(job.data.connectorInstanceId as string);
      return;
    }
    if (job.name === "insights") {
      const n = await generateInsights(db, new Date());
      console.log(`[worker] generated ${n} insight(s)`);
      return;
    }
    if (job.name === "domain-expiry") {
      const n = await checkDomainExpiry(db, new Date());
      console.log(`[worker] domain-expiry emitted ${n} event(s)`);
    }
    if (job.name === "digest") {
      const n = await sendWeeklyDigest(db, new Date());
      console.log(`[worker] weekly digest sent ${n} email(s)`);
    }
    if (job.name === "escalation") {
      const n = await escalateStaleIncidents(db, new Date());
      if (n > 0) console.log(`[worker] escalated ${n} stale incident(s)`);
    }
  },
  { connection },
);

worker.on("ready", async () => {
  console.log("Webmana worker ready");

  // Discover and register any third-party connector packages (Apache-2.0 SDK).
  const ext = await loadExternalConnectors();
  if (ext.loaded.length > 0) {
    console.log(`[worker] external connectors loaded: ${ext.loaded.join(", ")}`);
  }
  for (const f of ext.failed) {
    console.warn(`[worker] connector "${f.pkg}" skipped: ${f.error}`);
  }

  // Repeatable scan that drives due connector syncs.
  await syncQueue.add(
    "scan",
    {},
    { repeat: { every: SCAN_INTERVAL_MS }, jobId: "scan" },
  );
  // Run one scan immediately on boot.
  await syncQueue.add("scan", {}, { jobId: "scan-boot", removeOnComplete: true });

  // Domain expiry checks twice daily, plus once on boot.
  await syncQueue.add(
    "domain-expiry",
    {},
    { repeat: { every: 12 * 60 * 60 * 1000 }, jobId: "domain-expiry" },
  );
  await syncQueue.add(
    "domain-expiry",
    {},
    { jobId: "domain-expiry-boot", removeOnComplete: true },
  );

  // Weekly portfolio digest (logs always; emails when SMTP is configured).
  await syncQueue.add(
    "digest",
    {},
    { repeat: { every: digestIntervalMs() }, jobId: "digest" },
  );
  await syncQueue.add("digest", {}, { jobId: "digest-boot", removeOnComplete: true });

  // Escalate stale, unacknowledged incidents on a short cadence.
  await syncQueue.add(
    "escalation",
    {},
    { repeat: { every: escalationIntervalMs() }, jobId: "escalation" },
  );

  // Scheduled AI insight generation. Always scheduled; each run no-ops unless a
  // provider is configured via env or Settings → AI (resolved at run time).
  {
    const every = insightsIntervalMs();
    await syncQueue.add("insights", {}, { repeat: { every }, jobId: "insights" });
    await syncQueue.add(
      "insights",
      {},
      { jobId: "insights-boot", removeOnComplete: true },
    );
    console.log(`Webmana AI insights scheduled (every ${Math.round(every / 60000)}m)`);
  }
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

const shutdown = async () => {
  await worker.close();
  await syncQueue.close();
  await connection.quit();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
