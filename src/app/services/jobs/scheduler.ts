import { config } from "../../config";
import { features } from "../../config/features";
import { logger } from "../../shared/logger";

import { runScheduledJobs } from "./scheduledJobs.service";

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

export function startScheduledJobs(): void {
  if (!features.isScheduledJobsEnabled()) {
    logger.info("Scheduled jobs disabled (FEATURE_SCHEDULED_JOBS=false)");
    return;
  }

  if (intervalHandle) return;

  const intervalMs = config.scheduledJobsIntervalMs;
  logger.info("Starting scheduled jobs", { intervalMs });

  void tick();

  intervalHandle = setInterval(() => {
    void tick();
  }, intervalMs);

  intervalHandle.unref?.();
}

export function stopScheduledJobs(): void {
  if (!intervalHandle) return;

  clearInterval(intervalHandle);
  intervalHandle = null;
  logger.info("Scheduled jobs stopped");
}
