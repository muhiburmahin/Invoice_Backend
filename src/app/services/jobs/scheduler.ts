import { config } from "../../config";
import { features } from "../../config/features";
import { logger } from "../../shared/logger";
import { isRedisConfigured } from "../../infrastructure/redis";
import { enqueueScheduledJobs } from "../../infrastructure/scheduledJobs.queue";

import { runScheduledJobs, type ScheduledJobName } from "./scheduledJobs.service";

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) {
    logger.warn("Scheduled jobs skipped — previous run still in progress");
    return;
  }

  running = true;
  try {
    await runScheduledJobs();
  } catch (error) {
    logger.error("Scheduled jobs tick failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
}

function startIntervalScheduler(): void {
  if (intervalHandle) return;

  const intervalMs = config.scheduledJobsIntervalMs;
  logger.info("Starting in-process scheduled jobs", { intervalMs });

  void tick();

  intervalHandle = setInterval(() => {
    void tick();
  }, intervalMs);

  intervalHandle.unref?.();
}

export function startScheduledJobs(): void {
  if (!features.isScheduledJobsEnabled()) {
    logger.info("Scheduled jobs disabled (FEATURE_SCHEDULED_JOBS=false)");
    return;
  }

  if (isRedisConfigured()) {
    logger.info(
      "Scheduled jobs use BullMQ — run `npm run worker` alongside the API server",
    );
    return;
  }

  startIntervalScheduler();
}

export async function stopScheduledJobs(): Promise<void> {
  if (!intervalHandle) return;

  clearInterval(intervalHandle);
  intervalHandle = null;
  logger.info("In-process scheduled jobs stopped");
}

export async function triggerScheduledJobs(input?: {
  jobs?: ScheduledJobName[];
  preferQueue?: boolean;
}): Promise<
  | { mode: "queued"; jobId: string }
  | { mode: "inline"; result: Awaited<ReturnType<typeof runScheduledJobs>> }
> {
  if (isRedisConfigured() && input?.preferQueue !== false) {
    const { jobId } = await enqueueScheduledJobs({ jobs: input?.jobs });
    return { mode: "queued", jobId };
  }

  const result = await runScheduledJobs({ jobs: input?.jobs });
  return { mode: "inline", result };
}
