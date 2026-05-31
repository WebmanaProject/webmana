import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { eq } from "drizzle-orm";
import { createDatabase, schema } from "@webmana/db";
import { getConnector, type ConnectorRunContext } from "@webmana/connectors";

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
  const instances = await db
    .select({
      id: schema.connectorInstances.id,
      connectorId: schema.connectorInstances.connectorId,
      lastSyncAt: schema.connectorInstances.lastSyncAt,
    })
    .from(schema.connectorInstances)
    .where(eq(schema.connectorInstances.enabled, true));

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
    const ctx: ConnectorRunContext = {
      projectId: row.projectId,
      domain: row.domain,
      config: (row.config as Record<string, unknown>) ?? {},
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
    }
  },
  { connection },
);

worker.on("ready", async () => {
  console.log("Webmana worker ready");
  // Repeatable scan that drives due connector syncs.
  await syncQueue.add(
    "scan",
    {},
    { repeat: { every: SCAN_INTERVAL_MS }, jobId: "scan" },
  );
  // Run one scan immediately on boot.
  await syncQueue.add("scan", {}, { jobId: "scan-boot", removeOnComplete: true });
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
