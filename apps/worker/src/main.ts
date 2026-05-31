import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const QUEUE_NAME = "connector-sync";

/** Queue that holds one job per connector instance that is due for a sync. */
export const syncQueue = new Queue(QUEUE_NAME, { connection });

/**
 * Phase 0 skeleton. Phase 1 wires this to the connector SDK:
 * load the connector by id, run fetch() + normalize(), persist metrics/events,
 * and record sync status on the connector_instances row.
 */
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] sync job`, job.name, job.data);
  },
  { connection },
);

worker.on("ready", () => {
  // eslint-disable-next-line no-console
  console.log("Webmana worker ready");
});

worker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});
