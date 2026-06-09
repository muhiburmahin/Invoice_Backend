import type { Request } from "express";
import { startOfMonth, subMonths } from "date-fns";

import type {
  Prisma,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from "../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";
import { logger } from "../../shared/logger";
import { auth } from "../../lib/auth";
import { writeAuditLog } from "../../services/audit/auditLog.service";
import { SCHEDULED_JOB_NAMES } from "../../services/jobs";
import { triggerScheduledJobs } from "../../services/jobs/scheduler";
import { notifySubscriptionCancelled } from "../../services/notification";
import { getRequestIp } from "../auth/auth.helpers";
import { getMonthBuckets } from "../../../utils/monthBuckets";

import { SUPPORT_CAPABILITIES } from "./admin.constants";
import type {
  ActivityLogsQuery,
  ListUsersQuery,
  UpdateUserPlanInput,
  UpdateUserRoleInput,
  UpdateUserStatusInput,
  RunScheduledJobsInput,
} from "./admin.validation";

/* -------------------------------------------------------------------------- */
/*                          Capability / authorization                        */
/* -------------------------------------------------------------------------- */

function assertCapability(
  role: UserRole,
  capability: keyof typeof SUPPORT_CAPABILITIES,
): void {
  if (role === "SUPER_ADMIN") return;
  if (role === "SUPPORT" && SUPPORT_CAPABILITIES[capability]) return;
  throw new ApiError(
    403,
    "You do not have permission to perform this action",
    {
      code: "INSUFFICIENT_PERMISSIONS",
      details: { capability, yourRole: role },
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                                List users                                  */
/* -------------------------------------------------------------------------- */

export async function listUsers(
  actorRole: UserRole,
  query: ListUsersQuery,
) {
  assertCapability(actorRole, "readUsers");

  const where: Prisma.UserWhereInput = {};

  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: "insensitive" } },
      { name: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.role) {
    where.role = query.role;
  }
  if (query.plan) {
    where.subscription = { plan: query.plan };
  }
  if (typeof query.isVerified === "boolean") {
    where.isVerified = query.isVerified;
  }
  if (query.status === "active") {
    where.isActive = true;
    where.deletedAt = null;
  } else if (query.status === "inactive") {
    where.isActive = false;
    where.deletedAt = null;
  } else if (query.status === "deleted") {
    where.deletedAt = { not: null };
  }

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip,
      take: query.limit,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        isVerified: true,
        isActive: true,
        deletedAt: true,
        lastLoginAt: true,
        loginCount: true,
        createdAt: true,
        updatedAt: true,
        business: {
          select: {
            name: true,
            logo: true,
          },
        },
        subscription: {
          select: {
            plan: true,
            status: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / query.limit));

  return {
    rows,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPrevPage: query.page > 1,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              Get one user                                  */
/* -------------------------------------------------------------------------- */

export async function getUserDetail(actorRole: UserRole, userId: string) {
  assertCapability(actorRole, "readUsers");

  const [user, invoiceCount, clientCount, paymentSum] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        business: true,
        subscription: true,
        accounts: {
          select: { providerId: true, accountId: true, createdAt: true },
        },
      },
    }),
    prisma.invoice.count({
      where: { userId, deletedAt: null },
    }),
    prisma.client.count({
      where: { userId, deletedAt: null },
    }),
    prisma.payment.aggregate({
      where: { invoice: { userId }, status: "COMPLETED" },
      _sum: { amount: true },
    }),
  ]);

  if (!user) {
    throw new ApiError(404, "User not found", { code: "USER_NOT_FOUND" });
  }

  const {
    password: _pw,
    verificationToken: _vt,
    resetPasswordToken: _rt,
    refreshToken: _rf,
    ...safe
  } = user;

  return {
    user: safe,
    stats: {
      invoices: invoiceCount,
      clients: clientCount,
      paidTotal: paymentSum._sum.amount ?? 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                          Update user status                                */
/* -------------------------------------------------------------------------- */

export async function updateUserStatus(
  req: Request,
  actorId: string,
  actorRole: UserRole,
  targetId: string,
  input: UpdateUserStatusInput,
) {
  assertCapability(actorRole, "updateUserStatus");

  if (actorId === targetId) {
    throw new ApiError(400, "You cannot change your own status", {
      code: "CANNOT_MODIFY_SELF",
    });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!target) {
    throw new ApiError(404, "User not found", { code: "USER_NOT_FOUND" });
  }
  if (target.deletedAt) {
    throw new ApiError(409, "Cannot modify a deleted user", {
      code: "USER_DELETED",
    });
  }
  if (target.role === "SUPER_ADMIN") {
    throw new ApiError(403, "Cannot change status of another super admin", {
      code: "PROTECTED_TARGET",
    });
  }

  // No-op if status isn't actually changing.
  const current = await prisma.user.findUnique({
    where: { id: targetId },
    select: { isActive: true },
  });
  if (current?.isActive === input.isActive) {
    throw new ApiError(
      409,
      input.isActive ? "User is already active" : "User is already inactive",
      { code: "STATUS_UNCHANGED" },
    );
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { isActive: input.isActive },
    select: { id: true, email: true, isActive: true, role: true },
  });

  if (!input.isActive) {
    await prisma.session.deleteMany({ where: { userId: targetId } });
  }

  await writeAuditLog({
    userId: actorId,
    action: input.isActive ? "admin.user.activate" : "admin.user.deactivate",
    metadata: {
      targetUserId: targetId,
      reason: input.reason ?? null,
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return updated;
}

/* -------------------------------------------------------------------------- */
/*                            Update user role                                */
/* -------------------------------------------------------------------------- */

export async function updateUserRole(
  req: Request,
  actorId: string,
  actorRole: UserRole,
  targetId: string,
  input: UpdateUserRoleInput,
) {
  assertCapability(actorRole, "updateUserRole");

  if (actorId === targetId) {
    throw new ApiError(400, "You cannot change your own role", {
      code: "CANNOT_MODIFY_SELF",
    });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, deletedAt: true, isActive: true },
  });
  if (!target) {
    throw new ApiError(404, "User not found", { code: "USER_NOT_FOUND" });
  }
  if (target.deletedAt) {
    throw new ApiError(409, "Cannot modify a deleted user", {
      code: "USER_DELETED",
    });
  }

  // No-op if role isn't actually changing.
  if (target.role === input.role) {
    throw new ApiError(409, `User is already a ${input.role}`, {
      code: "ROLE_UNCHANGED",
    });
  }

  // Prevent locking out the platform — never demote the last active super admin.
  if (target.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN") {
    const remainingAdmins = await prisma.user.count({
      where: {
        role: "SUPER_ADMIN",
        isActive: true,
        deletedAt: null,
        id: { not: targetId },
      },
    });
    if (remainingAdmins < 1) {
      throw new ApiError(
        403,
        "Cannot demote the last active super admin. Promote another user first.",
        { code: "LAST_SUPER_ADMIN" },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { role: input.role },
    select: { id: true, email: true, role: true },
  });

  // If the user lost staff privileges, also revoke their active sessions so
  // they're forced to sign in again with their new (lower) permissions.
  if (target.role !== "USER" && input.role === "USER") {
    await prisma.session.deleteMany({ where: { userId: targetId } });
  }

  await writeAuditLog({
    userId: actorId,
    action: "admin.user.role_change",
    metadata: {
      targetUserId: targetId,
      previousRole: target.role,
      newRole: input.role,
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return updated;
}

/* -------------------------------------------------------------------------- */
/*                            Update user plan                                */
/* -------------------------------------------------------------------------- */

export async function updateUserPlan(
  req: Request,
  actorId: string,
  actorRole: UserRole,
  targetId: string,
  input: UpdateUserPlanInput,
) {
  assertCapability(actorRole, "updateUserPlan");

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      deletedAt: true,
      subscription: {
        select: {
          status: true,
          cancelAtPeriodEnd: true,
        },
      },
    },
  });
  if (!target) {
    throw new ApiError(404, "User not found", { code: "USER_NOT_FOUND" });
  }
  if (target.deletedAt) {
    throw new ApiError(409, "Cannot modify a deleted user", {
      code: "USER_DELETED",
    });
  }

  const data: Prisma.SubscriptionUpdateInput = {
    plan: input.plan as SubscriptionPlan,
  };
  if (input.status) data.status = input.status as SubscriptionStatus;
  if (input.currentPeriodEnd) data.currentPeriodEnd = input.currentPeriodEnd;
  if (typeof input.cancelAtPeriodEnd === "boolean") {
    data.cancelAtPeriodEnd = input.cancelAtPeriodEnd;
  }

  const subscription = await prisma.subscription.upsert({
    where: { userId: targetId },
    update: data,
    create: {
      userId: targetId,
      plan: input.plan as SubscriptionPlan,
      status: (input.status as SubscriptionStatus | undefined) ?? "ACTIVE",
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "admin.user.plan_change",
    metadata: {
      targetUserId: targetId,
      plan: input.plan,
      status: input.status ?? null,
      reason: input.reason ?? null,
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  const wasCancelled =
    target.subscription?.status === "CANCELLED" ||
    target.subscription?.cancelAtPeriodEnd === true;
  const isCancelled =
    subscription.status === "CANCELLED" || subscription.cancelAtPeriodEnd === true;

  if (isCancelled && !wasCancelled) {
    await notifySubscriptionCancelled({
      userId: targetId,
      plan: subscription.plan,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  }

  return subscription;
}

/* -------------------------------------------------------------------------- */
/*                            Delete user (soft)                              */
/* -------------------------------------------------------------------------- */

export async function deleteUser(
  req: Request,
  actorId: string,
  actorRole: UserRole,
  targetId: string,
) {
  assertCapability(actorRole, "deleteUser");

  if (actorId === targetId) {
    throw new ApiError(400, "You cannot delete your own account here", {
      code: "CANNOT_MODIFY_SELF",
    });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!target) {
    throw new ApiError(404, "User not found", { code: "USER_NOT_FOUND" });
  }
  if (target.deletedAt) {
    throw new ApiError(409, "User is already deleted", {
      code: "USER_ALREADY_DELETED",
    });
  }
  if (target.role === "SUPER_ADMIN") {
    throw new ApiError(403, "Cannot delete another super admin", {
      code: "PROTECTED_TARGET",
    });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data: { deletedAt: new Date(), isActive: false },
    }),
    prisma.session.deleteMany({ where: { userId: targetId } }),
  ]);

  await writeAuditLog({
    userId: actorId,
    action: "admin.user.delete",
    metadata: { targetUserId: targetId },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });
}

/* -------------------------------------------------------------------------- */
/*                       Trigger password reset for user                      */
/* -------------------------------------------------------------------------- */

export async function triggerPasswordReset(
  req: Request,
  actorId: string,
  actorRole: UserRole,
  targetId: string,
): Promise<void> {
  assertCapability(actorRole, "triggerPasswordReset");

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, deletedAt: true, isActive: true },
  });
  if (!target || target.deletedAt || !target.isActive) {
    throw new ApiError(404, "User not found or inactive", {
      code: "USER_NOT_FOUND",
    });
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email: target.email, redirectTo: "/auth/reset-password" },
    });
  } catch (e) {
    logger.warn("Admin-triggered password reset failed", { error: String(e) });
  }

  await writeAuditLog({
    userId: actorId,
    action: "admin.user.reset_password_trigger",
    metadata: { targetUserId: targetId },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });
}

/* -------------------------------------------------------------------------- */
/*                            Platform statistics                             */
/* -------------------------------------------------------------------------- */

const CHART_MONTHS = 6;

export async function getPlatformStats(actorRole: UserRole) {
  assertCapability(actorRole, "readStats");

  const monthStart = startOfMonth(new Date());
  const lastMonthStart = startOfMonth(subMonths(new Date(), 1));
  const monthBuckets = getMonthBuckets(CHART_MONTHS);

  const [
    totalUsers,
    activeUsers,
    deletedUsers,
    newUsersThisMonth,
    newUsersLastMonth,
    totalInvoices,
    paidInvoices,
    overdueInvoices,
    revenueSumThisMonth,
    revenueSumAllTime,
    planCounts,
    monthlyUserCounts,
    monthlyRevenueSums,
    invoiceStatusCounts,
    userRoleCounts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true, deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: { not: null } } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({
      where: { createdAt: { gte: lastMonthStart, lt: monthStart } },
    }),
    prisma.invoice.count({ where: { deletedAt: null } }),
    prisma.invoice.count({
      where: { deletedAt: null, status: "PAID" },
    }),
    prisma.invoice.count({
      where: { deletedAt: null, status: "OVERDUE" },
    }),
    prisma.payment.aggregate({
      where: { status: "COMPLETED", paidAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: "COMPLETED" },
      _sum: { amount: true },
    }),
    prisma.subscription.groupBy({
      by: ["plan"],
      _count: { _all: true },
    }),
    Promise.all(
      monthBuckets.map((bucket) =>
        prisma.user.count({
          where: { createdAt: { gte: bucket.start, lt: bucket.end } },
        }),
      ),
    ),
    Promise.all(
      monthBuckets.map((bucket) =>
        prisma.payment.aggregate({
          where: {
            status: "COMPLETED",
            paidAt: { gte: bucket.start, lt: bucket.end },
          },
          _sum: { amount: true },
        }),
      ),
    ),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["role"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const planBreakdown = planCounts.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.plan] = row._count._all;
      return acc;
    },
    { FREE: 0, PRO: 0, ENTERPRISE: 0 },
  );

  const invoicesByStatus = invoiceStatusCounts.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    },
    {},
  );

  const usersByRole = userRoleCounts.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.role] = row._count._all;
      return acc;
    },
    {},
  );

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      deleted: deletedUsers,
      newThisMonth: newUsersThisMonth,
      newLastMonth: newUsersLastMonth,
    },
    invoices: {
      total: totalInvoices,
      paid: paidInvoices,
      overdue: overdueInvoices,
    },
    revenue: {
      thisMonth: revenueSumThisMonth._sum.amount ?? 0,
      allTime: revenueSumAllTime._sum.amount ?? 0,
    },
    plans: planBreakdown,
    charts: {
      userGrowth: monthBuckets.map((bucket, i) => ({
        label: bucket.label,
        key: bucket.key,
        count: monthlyUserCounts[i] ?? 0,
      })),
      revenueTrend: monthBuckets.map((bucket, i) => ({
        label: bucket.label,
        key: bucket.key,
        amount: monthlyRevenueSums[i]?._sum.amount ?? 0,
      })),
      invoicesByStatus,
      usersByRole,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              Activity logs                                 */
/* -------------------------------------------------------------------------- */

export async function listActivityLogs(
  actorRole: UserRole,
  query: ActivityLogsQuery,
) {
  assertCapability(actorRole, "readActivityLogs");

  const where: Prisma.ActivityLogWhereInput = {};
  if (query.userId) where.userId = query.userId;
  if (query.action) where.action = { contains: query.action };

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / query.limit));

  return {
    rows,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPrevPage: query.page > 1,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                           Scheduled background jobs                        */
/* -------------------------------------------------------------------------- */

export async function runAdminScheduledJobs(
  req: Request,
  actorId: string,
  actorRole: UserRole,
  input: RunScheduledJobsInput,
) {
  assertCapability(actorRole, "runScheduledJobs");

  const outcome = await triggerScheduledJobs({ jobs: input.jobs });

  await writeAuditLog({
    userId: actorId,
    action: "admin.jobs.run",
    metadata: {
      jobs: input.jobs ?? [...SCHEDULED_JOB_NAMES],
      mode: outcome.mode,
      ...(outcome.mode === "queued"
        ? { jobId: outcome.jobId }
        : {
            durationMs: outcome.result.durationMs,
            summary: outcome.result.jobs.map((job) => ({
              name: job.name,
              durationMs: job.durationMs,
              result: job.result,
            })),
          }),
    } as Prisma.InputJsonValue,
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  if (outcome.mode === "queued") {
    return {
      queued: true,
      jobId: outcome.jobId,
      message: "Scheduled jobs queued for background processing",
    };
  }

  return outcome.result;
}
