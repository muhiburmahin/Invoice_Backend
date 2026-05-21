import type { SubscriptionPlan } from "../../generated/prisma/client";

export type PlanLimits = {
  maxClients: number;
  maxInvoicesPerMonth: number;
  maxRecurringSchedules: number;
  pdfExport: boolean;
  customBranding: boolean;
  prioritySupport: boolean;
};

/** SaaS plan quotas — enforce in feature routes before create operations. */
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE: {
    maxClients: 10,
    maxInvoicesPerMonth: 5,
    maxRecurringSchedules: 0,
    pdfExport: true,
    customBranding: false,
    prioritySupport: false,
  },
  PRO: {
    maxClients: 500,
    maxInvoicesPerMonth: 200,
    maxRecurringSchedules: 25,
    pdfExport: true,
    customBranding: true,
    prioritySupport: false,
  },
  ENTERPRISE: {
    maxClients: Number.POSITIVE_INFINITY,
    maxInvoicesPerMonth: Number.POSITIVE_INFINITY,
    maxRecurringSchedules: Number.POSITIVE_INFINITY,
    pdfExport: true,
    customBranding: true,
    prioritySupport: true,
  },
};

export function getPlanLimits(plan: SubscriptionPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function isPaidPlan(plan: SubscriptionPlan): boolean {
  return plan !== "FREE";
}
