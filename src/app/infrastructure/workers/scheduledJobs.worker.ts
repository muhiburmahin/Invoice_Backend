import { Worker } from "bullmq";

import { logger } from "../../shared/logger";
import {
  runScheduledJobByName,
  runScheduledJobs,
  SCHEDULED_JOB_NAMES,
  type ScheduledJobName,
} from "../../services/jobs/scheduledJobs.service";

import {
  SCHEDULED_JOBS_QUEUE_NAME,
  type ScheduledJobsQueuePayload,
} from "../scheduledJobs.queue";
import { getRedisConnection, isRedisConfigured } from "../redis";

let worker: Worker<ScheduledJobsQueuePayload> | null = null;

function isScheduledJobName(name: string): name is ScheduledJobName {
  return SCHEDULED_JOB_NAMES.includes(name as ScheduledJobName);
}

export function startScheduledJobsWorker(): void {
  if (!isRedisConfigured()) return;
  if (worker) return;

  worker = new Worker<ScheduledJobsQueuePayload>(
    SCHEDULED_JOBS_QUEUE_NAME,
    async (job) => {
      if (job.name === "run-all") {
        return runScheduledJobs({ jobs: job.data.jobs });
      }

      if (isScheduledJobName(job.name)) {
        return runScheduledJobByName(job.name);
      }

      throw new Error(`Unknown scheduled job: ${job.name}`);
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("failed", (job, error) => {
    logger.error("Scheduled job worker failed", {
      jobId: job?.id,
      name: job?.name,
      error: error.message,
    });
  });

  logger.info("Scheduled jobs BullMQ worker started");
}

export async function stopScheduledJobsWorker(): Promise<void> {
  if (!worker) return;

  await worker.close();
  worker = null;
  logger.info("Scheduled jobs BullMQ worker stopped");
}
