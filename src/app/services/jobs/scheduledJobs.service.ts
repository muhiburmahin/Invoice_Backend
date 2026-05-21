import { logger } from "../../shared/logger";
import { processDueRecurringSchedules } from "../../modules/recurring/recurring.service";
import {
  processOverdueInvoices,
  processSubscriptionExpiryReminders,
} from "../notification";

export const SCHEDULED_JOB_NAMES = [
  "overdue",
  "subscription_expiry",
  "recurring",
] as const;

export type ScheduledJobName = (typeof SCHEDULED_JOB_NAMES)[number];

export type ScheduledJobResult = {
  name: ScheduledJobName;
  durationMs: number;
  result: unknown;
};

export type RunScheduledJobsResult = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  jobs: ScheduledJobResult[];
};

const JOB_RUNNERS: Record<
  ScheduledJobName,
  () => Promise<unknown>
> = {
  overdue: processOverdueInvoices,
  subscription_expiry: () => processSubscriptionExpiryReminders(7),
  recurring: () => processDueRecurringSchedules(),
};

function resolveJobs(jobs?: ScheduledJobName[]): ScheduledJobName[] {
  if (!jobs || jobs.length === 0) {
    return [...SCHEDULED_JOB_NAMES];
  }

  const unique = [...new Set(jobs)];
  for (const name of unique) {
    if (!SCHEDULED_JOB_NAMES.includes(name)) {
      throw new Error(`Unknown scheduled job: ${name}`);
    }
  }

  return unique;
}

export async function runScheduledJobs(input?: {
  jobs?: ScheduledJobName[];
}): Promise<RunScheduledJobsResult> {
  const startedAt = new Date();
  const jobNames = resolveJobs(input?.jobs);
  const results: ScheduledJobResult[] = [];

  for (const name of jobNames) {
    const jobStarted = Date.now();
    logger.info(`Scheduled job started: ${name}`);

    try {
      const result = await JOB_RUNNERS[name]();
      const durationMs = Date.now() - jobStarted;
      results.push({ name, durationMs, result });
      logger.info(`Scheduled job finished: ${name}`, {
        durationMs,
        result,
      });
    } catch (error) {
      const durationMs = Date.now() - jobStarted;
      logger.error(`Scheduled job failed: ${name}`, {
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  const finishedAt = new Date();

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    jobs: results,
  };
}
