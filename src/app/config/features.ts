import { config } from "./index";

/** SaaS feature toggles (backed by env — see `config.features`) */
export const features = {
  isBillingEnabled: () => config.features.billing,
  isOfflineBillingEnabled: () => config.features.offlineBilling,
  isAuditLogEnabled: () => config.features.auditLog,
  isScheduledJobsEnabled: () => config.features.scheduledJobs,
} as const;
