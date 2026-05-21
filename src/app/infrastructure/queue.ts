import { config } from "../config";

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

export const jobQueue: JobQueue = new NoopJobQueue();
