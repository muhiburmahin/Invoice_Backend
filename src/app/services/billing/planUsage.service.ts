import { startOfMonth } from "date-fns";

import type { SubscriptionPlan } from "../../../generated/prisma/client";
import { getPlanLimits } from "../../constants/plans";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";

export type UsageSnapshot = {
  plan: SubscriptionPlan;
  clients: number;
  invoicesThisMonth: number;
  recurringSchedules: number;
};

export async function getUsageSnapshot(userId: string): Promise<UsageSnapshot> {
  const monthStart = startOfMonth(new Date());

  const [subscription, clients, invoicesThisMonth, recurringSchedules] =
    await Promise.all([
      prisma.subscription.findUnique({ where: { userId } }),
      prisma.client.count({ where: { userId, deletedAt: null } }),
      prisma.invoice.count({
        where: {
          userId,
          deletedAt: null,
          createdAt: { gte: monthStart },
        },
      }),
      prisma.recurringSchedule.count({ where: { userId, isActive: true } }),
    ]);

  return {
    plan: subscription?.plan ?? "FREE",
    clients,
    invoicesThisMonth,
    recurringSchedules,
  };
}

export async function assertWithinPlanLimits(
  userId: string,
  resource: "clients" | "invoices" | "recurring",
  options?: { skipRecurringCount?: boolean },
): Promise<void> {
  const usage = await getUsageSnapshot(userId);
  const limits = getPlanLimits(usage.plan);

  if (resource === "clients" && usage.clients >= limits.maxClients) {
    throw new ApiError(403, "Client limit reached for your plan", {
      code: "PLAN_LIMIT_CLIENTS",
      details: { plan: usage.plan, limit: limits.maxClients, used: usage.clients },
    });
  }

  if (
    resource === "invoices" &&
    usage.invoicesThisMonth >= limits.maxInvoicesPerMonth
  ) {
    throw new ApiError(403, "Monthly invoice limit reached for your plan", {
      code: "PLAN_LIMIT_INVOICES",
      details: {
        plan: usage.plan,
        limit: limits.maxInvoicesPerMonth,
        used: usage.invoicesThisMonth,
      },
    });
  }

  if (resource === "recurring") {
    if (limits.maxRecurringSchedules === 0) {
      throw new ApiError(
        403,
        "Recurring invoicing is not available on your plan",
        {
          code: "PLAN_FEATURE_UNAVAILABLE",
          details: { plan: usage.plan },
        },
      );
    }

    if (usage.recurringSchedules >= limits.maxRecurringSchedules) {
      if (!options?.skipRecurringCount) {
        throw new ApiError(403, "Recurring schedule limit reached for your plan", {
          code: "PLAN_LIMIT_RECURRING",
          details: {
            plan: usage.plan,
            limit: limits.maxRecurringSchedules,
            used: usage.recurringSchedules,
          },
        });
      }
    }
  }
}
