import "dotenv/config";

import { features } from "./app/config/features";
import { closeRedisConnection, isRedisConfigured } from "./app/infrastructure/redis";
import {
  closeScheduledJobsQueue,
  registerScheduledJobsRepeatable,
} from "./app/infrastructure/scheduledJobs.queue";
import {
  startScheduledJobsWorker,
  stopScheduledJobsWorker,
} from "./app/infrastructure/workers/scheduledJobs.worker";
import { logger } from "./app/shared/logger";

const SHUTDOWN_MS = 10_000;

async function main(): Promise<void> {
  if (!features.isScheduledJobsEnabled()) {
    logger.info("FEATURE_SCHEDULED_JOBS=false — worker exiting");
    process.exit(0);
  }

  if (!isRedisConfigured()) {
    logger.error("REDIS_URL is required for the background worker");
    process.exit(1);
  }

  startScheduledJobsWorker();
  await registerScheduledJobsRepeatable();
  logger.info("Invoice background worker ready");
}

void main();

const shutdown = (signal: string) => {
  logger.info(`${signal} received. Shutting down worker...`);
  void (async () => {
    await stopScheduledJobsWorker();
    await closeScheduledJobsQueue();
    await closeRedisConnection();
    process.exit(0);
  })();

  setTimeout(() => {
    logger.error("Forced worker exit after shutdown timeout");
    process.exit(1);
  }, SHUTDOWN_MS);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
