import type { Request } from "express";
import type { SubscriptionPlan } from "@prisma/client";
import { ApiError } from "../../errors/ApiError";
import { config } from "../../config";
import { features } from "../../config/features";
import { prisma } from "../../shared/prisma";
import { writeAuditLog } from "../audit/auditLog.service";
import { createNotification } from "../notification";
import { getRequestIp } from "../../modules/auth/auth.helpers";

const OFFLINE_UPGRADE_ACTION = "billing.offline_upgrade_requested";
const UPGRADEABLE_OFFLINE_PLANS = ["PRO"] as const;

export type OfflineUpgradePlan = (typeof UPGRADEABLE_OFFLINE_PLANS)[number];

export function getOfflineBillingPublicInfo() {
  const enabled = features.isOfflineBillingEnabled();
  const { proPrice, currency, bkash, nagad, bankName, bankAccount, instructions } =
    config.offlineBilling;

  return {
    enabled,
    plans: UPGRADEABLE_OFFLINE_PLANS,
    pro: {
      price: proPrice,
      currency,
      label: "Pro plan (monthly)",
    },
    paymentMethods: {
      bkash: bkash || null,
      nagad: nagad || null,
      bankName: bankName || null,
      bankAccount: bankAccount || null,
    },
    instructions,
  };
}

export async function hasPendingOfflineUpgrade(userId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true },
  });

  if (!subscription || subscription.plan !== "FREE") {
    return false;
  }

  const latestRequest = await prisma.activityLog.findFirst({
    where: { userId, action: OFFLINE_UPGRADE_ACTION },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!latestRequest) return false;

  const planChangeAfter = await prisma.activityLog.findFirst({
    where: {
      userId,
      action: "admin.user.plan_change",
      createdAt: { gt: latestRequest.createdAt },
    },
    select: { id: true },
  });

  return !planChangeAfter;
}

async function notifyStaffOfUpgradeRequest(input: {
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  plan: OfflineUpgradePlan;
  paymentReference?: string | null;
}) {
  const staff = await prisma.user.findMany({
    where: {
      role: { in: ["SUPER_ADMIN", "SUPPORT"] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  await Promise.all(
    staff.map((member) =>
      createNotification({
        userId: member.id,
        type: "PLAN_UPGRADE_REQUEST",
        title: "Pro upgrade request",
        message: `${input.requesterName} (${input.requesterEmail}) requested ${input.plan} via offline payment.`,
        data: {
          requesterId: input.requesterId,
          requesterEmail: input.requesterEmail,
          plan: input.plan,
          paymentReference: input.paymentReference ?? null,
        },
      }),
    ),
  );
}

export async function submitOfflineUpgradeRequest(
  req: Request,
  userId: string,
  input: {
    plan: OfflineUpgradePlan;
    paymentReference?: string | null;
    note?: string | null;
  },
) {
  if (!features.isOfflineBillingEnabled()) {
    throw new ApiError(503, "Offline billing is not enabled", {
      code: "OFFLINE_BILLING_DISABLED",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      subscription: { select: { plan: true } },
    },
  });

  if (!user?.subscription) {
    throw new ApiError(404, "Subscription not found", {
      code: "SUBSCRIPTION_NOT_FOUND",
    });
  }

  if (user.subscription.plan !== "FREE") {
    throw new ApiError(409, "You are already on a paid plan", {
      code: "PLAN_ALREADY_PAID",
      details: { plan: user.subscription.plan },
    });
  }

  const pending = await hasPendingOfflineUpgrade(userId);
  if (pending) {
    throw new ApiError(409, "You already have a pending upgrade request", {
      code: "UPGRADE_REQUEST_PENDING",
    });
  }

  const paymentReference = input.paymentReference?.trim() || null;
  const note = input.note?.trim() || null;

  await prisma.activityLog.create({
    data: {
      userId,
      action: OFFLINE_UPGRADE_ACTION,
      metadata: {
        plan: input.plan,
        paymentReference,
        note,
      },
      ipAddress: getRequestIp(req),
      userAgent: req.get("user-agent") ?? undefined,
    },
  });

  await writeAuditLog({
    userId,
    action: OFFLINE_UPGRADE_ACTION,
    metadata: { plan: input.plan, paymentReference, note },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  await createNotification({
    userId,
    type: "PLAN_UPGRADE_REQUEST",
    title: "Upgrade request received",
    message: `We received your ${input.plan} upgrade request. An admin will activate your plan after verifying payment.`,
    data: {
      plan: input.plan,
      paymentReference,
      status: "pending",
    },
  });

  await notifyStaffOfUpgradeRequest({
    requesterId: user.id,
    requesterName: user.name,
    requesterEmail: user.email,
    plan: input.plan,
    paymentReference,
  });

  return {
    message: "Upgrade request submitted. An admin will activate Pro after verifying payment.",
    plan: input.plan as SubscriptionPlan,
    pending: true,
  };
}

export async function listPendingOfflineUpgradeRequests() {
  const requests = await prisma.activityLog.findMany({
    where: { action: OFFLINE_UPGRADE_ACTION },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          subscription: { select: { plan: true } },
        },
      },
    },
  });

  const pending = [];

  for (const log of requests) {
    if (!log.user || log.user.subscription?.plan !== "FREE") continue;

    const planChangeAfter = await prisma.activityLog.findFirst({
      where: {
        userId: log.userId,
        action: "admin.user.plan_change",
        createdAt: { gt: log.createdAt },
      },
      select: { id: true },
    });

    if (planChangeAfter) continue;

    const metadata = log.metadata as {
      plan?: string;
      paymentReference?: string | null;
      note?: string | null;
    } | null;

    pending.push({
      id: log.id,
      userId: log.userId,
      userName: log.user.name,
      userEmail: log.user.email,
      plan: metadata?.plan ?? "PRO",
      paymentReference: metadata?.paymentReference ?? null,
      note: metadata?.note ?? null,
      requestedAt: log.createdAt.toISOString(),
    });
  }

  return pending;
}
