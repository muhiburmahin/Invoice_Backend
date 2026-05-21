import { config } from "../config";

import { isRedisConfigured } from "./redis";
import { enqueueScheduledJobs } from "./scheduledJobs.queue";

export type JobName = string;

export type JobPayload = Record<string, unknown>;

export interface JobQueue {
  enqueue(name: JobName, payload: JobPayload): Promise<void>;
}

export class NoopJobQueue implements JobQueue {
  async enqueue(name: JobName, payload: JobPayload): Promise<void> {
    if (!config.isProduction) {
      console.debug(`[queue:noop] ${name}`, payload);
    }
  }
}

class BullMQJobQueue implements JobQueue {
  async enqueue(name: JobName, payload: JobPayload): Promise<void> {
    if (name === "run-all" || name === "scheduled-jobs") {
      await enqueueScheduledJobs({
        jobs: payload.jobs as never,
      });
      return;
    }

    const jobsQueue = await import("./scheduledJobs.queue");
    const queue = jobsQueue.getScheduledJobsQueue();
    await queue.add(name, payload as never);
  }
}

export const jobQueue: JobQueue = isRedisConfigured()
  ? new BullMQJobQueue()
  : new NoopJobQueue();
