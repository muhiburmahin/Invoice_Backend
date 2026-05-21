import { Queue } from "bullmq";

import { config } from "../config";
import { logger } from "../shared/logger";
import type { ScheduledJobName } from "../services/jobs/scheduledJobs.service";

import { getRedisConnection, isRedisConfigured } from "./redis";

export const SCHEDULED_JOBS_QUEUE_NAME = "invoice-scheduled-jobs";

export type ScheduledJobsQueuePayload = {
  jobs?: ScheduledJobName[];
};

let queue: Queue<ScheduledJobsQueuePayload> | null = null;

export function getScheduledJobsQueue(): Queue<ScheduledJobsQueuePayload> {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is not configured");
  }

  if (!queue) {
    queue = new Queue<ScheduledJobsQueuePayload>(SCHEDULED_JOBS_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      },
    });
  }

  return queue;
}

export async function enqueueScheduledJobs(
  payload: ScheduledJobsQueuePayload = {},
): Promise<{ jobId: string }> {
  const jobsQueue = getScheduledJobsQueue();
  const job = await jobsQueue.add("run-all", payload);
  return { jobId: job.id ?? "unknown" };
}

export async function registerScheduledJobsRepeatable(): Promise<void> {
  if (!isRedisConfigured()) return;

  const jobsQueue = getScheduledJobsQueue();
  const repeatables = await jobsQueue.getRepeatableJobs();

  for (const repeatable of repeatables) {
    await jobsQueue.removeRepeatableByKey(repeatable.key);
  }

  await jobsQueue.add(
    "run-all",
    {},
    {
      repeat: { every: config.scheduledJobsIntervalMs },
    },
  );

  logger.info("Registered BullMQ repeatable scheduled jobs", {
    intervalMs: config.scheduledJobsIntervalMs,
  });
}

export async function closeScheduledJobsQueue(): Promise<void> {
  if (!queue) return;

  await queue.close();
  queue = null;
}
