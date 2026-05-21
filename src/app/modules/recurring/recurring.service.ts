import type { Request } from "express";
import { addDays, startOfDay } from "date-fns";

import type { Prisma } from "../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { getPlanLimits } from "../../constants/plans";
import { prisma } from "../../shared/prisma";
import { buildPaginationMeta } from "../../shared/pagination";
import {
  assertWithinPlanLimits,
  getUsageSnapshot,
} from "../../services/billing/planUsage.service";
import { writeAuditLog } from "../../services/audit/auditLog.service";
import { getRequestIp } from "../auth/auth.helpers";
import { assertClientBillable } from "../invoice/invoice.helpers";

import {
  RECURRING_DUE_SOON_DAYS,
  RECURRING_FREQUENCIES,
  RECURRING_INVOICE_SELECT,
  RECURRING_LIST_SELECT,
} from "./recurring.constants";
import {
  assertNoLinkedInvoices,
  computeNextRunAt,
  enrichSchedule,
  findOwnedSchedule,
} from "./recurring.helpers";
import type {
  CreateRecurringInput,
  ListRecurringQuery,
  UpdateRecurringInput,
  UpdateRecurringStatusInput,
} from "./recurring.validation";

/* -------------------------------------------------------------------------- */
/*                                   Create                                   */
/* -------------------------------------------------------------------------- */

export async function createRecurringSchedule(
  req: Request,
  userId: string,
  input: CreateRecurringInput,
) {
  await assertWithinPlanLimits(userId, "recurring", {
    skipRecurringCount: input.isActive === false,
  });
  await assertClientBillable(userId, input.clientId);

  const nextRunAt = input.nextRunAt ?? new Date();

  const schedule = await prisma.recurringSchedule.create({
    data: {
      userId,
      clientId: input.clientId,
      frequency: input.frequency,
      nextRunAt,
      isActive: input.isActive,
    },
    select: RECURRING_LIST_SELECT,
  });

  await writeAuditLog({
    userId,
    action: "recurring.create",
    metadata: {
      scheduleId: schedule.id,
      clientId: schedule.clientId,
      frequency: schedule.frequency,
      isActive: schedule.isActive,
      nextRunAt: schedule.nextRunAt.toISOString(),
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return enrichSchedule(schedule);
}

/* -------------------------------------------------------------------------- */
/*                                    List                                    */
/* -------------------------------------------------------------------------- */

export async function listRecurringSchedules(
  userId: string,
  query: ListRecurringQuery,
) {
  const where: Prisma.RecurringScheduleWhereInput = { userId };

  if (query.clientId) where.clientId = query.clientId;
  if (query.frequency) where.frequency = query.frequency;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.overdue === true) {
    where.nextRunAt = { lt: new Date() };
    if (query.isActive === undefined) where.isActive = true;
  } else if (query.overdue === false) {
    where.NOT = {
      AND: [{ isActive: true }, { nextRunAt: { lt: new Date() } }],
    };
  }

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.recurringSchedule.count({ where }),
    prisma.recurringSchedule.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip,
      take: query.limit,
      select: RECURRING_LIST_SELECT,
    }),
  ]);

  const enriched = rows.map(enrichSchedule);

  return { rows: enriched, meta: buildPaginationMeta(total, query) };
}

/* -------------------------------------------------------------------------- */
/*                                   Stats                                    */
/* -------------------------------------------------------------------------- */

export async function getRecurringStats(userId: string) {
  const now = new Date();
  const dueSoonEnd = addDays(startOfDay(now), RECURRING_DUE_SOON_DAYS);

  const [usage, total, active, inactive, overdue, dueSoon, frequencyGroups] =
    await Promise.all([
      getUsageSnapshot(userId),
      prisma.recurringSchedule.count({ where: { userId } }),
      prisma.recurringSchedule.count({ where: { userId, isActive: true } }),
      prisma.recurringSchedule.count({ where: { userId, isActive: false } }),
      prisma.recurringSchedule.count({
        where: { userId, isActive: true, nextRunAt: { lt: now } },
      }),
      prisma.recurringSchedule.count({
        where: {
          userId,
          isActive: true,
          nextRunAt: { gte: startOfDay(now), lte: dueSoonEnd },
        },
      }),
      prisma.recurringSchedule.groupBy({
        by: ["frequency"],
        where: { userId, isActive: true },
        _count: { _all: true },
      }),
    ]);

  const limits = getPlanLimits(usage.plan);
  const byFrequency = frequencyGroups.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.frequency] = row._count._all;
      return acc;
    },
    {},
  );

  return {
    total,
    active,
    inactive,
    overdue,
    dueSoon,
    byFrequency,
    plan: usage.plan,
    limit: limits.maxRecurringSchedules,
    used: usage.recurringSchedules,
  };
}

export function getRecurringMeta() {
  return {
    frequencies: RECURRING_FREQUENCIES,
    dueSoonDays: RECURRING_DUE_SOON_DAYS,
    sortFields: ["createdAt", "nextRunAt", "updatedAt"] as const,
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Detail                                   */
/* -------------------------------------------------------------------------- */

export async function getRecurringDetail(userId: string, scheduleId: string) {
  const schedule = await findOwnedSchedule(userId, scheduleId);

  return {
    schedule: enrichSchedule(schedule),
    invoiceCount: schedule._count.invoices,
  };
}

export async function listScheduleInvoices(
  userId: string,
  scheduleId: string,
) {
  await findOwnedSchedule(userId, scheduleId);

  const invoices = await prisma.invoice.findMany({
    where: { recurringId: scheduleId, userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: RECURRING_INVOICE_SELECT,
  });

  return { invoices };
}

/* -------------------------------------------------------------------------- */
/*                                   Update                                   */
/* -------------------------------------------------------------------------- */

export async function updateRecurringSchedule(
  req: Request,
  userId: string,
  scheduleId: string,
  input: UpdateRecurringInput,
) {
  const current = await findOwnedSchedule(userId, scheduleId);

  if (current.client.deletedAt || !current.client.isActive) {
    throw new ApiError(409, "Cannot update a schedule for an inactive client", {
      code: "CLIENT_NOT_BILLABLE",
    });
  }

  const schedule = await prisma.recurringSchedule.update({
    where: { id: scheduleId },
    data: {
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.nextRunAt !== undefined ? { nextRunAt: input.nextRunAt } : {}),
    },
    select: RECURRING_LIST_SELECT,
  });

  await writeAuditLog({
    userId,
    action: "recurring.update",
    metadata: {
      scheduleId,
      changes: input,
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return enrichSchedule(schedule);
}

export async function updateRecurringStatus(
  req: Request,
  userId: string,
  scheduleId: string,
  input: UpdateRecurringStatusInput,
) {
  const current = await findOwnedSchedule(userId, scheduleId);

  if (input.isActive === current.isActive) {
    throw new ApiError(
      409,
      `Schedule is already ${input.isActive ? "active" : "inactive"}`,
      { code: "STATUS_UNCHANGED" },
    );
  }

  if (input.isActive) {
    await assertWithinPlanLimits(userId, "recurring");
    await assertClientBillable(userId, current.clientId);
  }

  const schedule = await prisma.recurringSchedule.update({
    where: { id: scheduleId },
    data: { isActive: input.isActive },
    select: RECURRING_LIST_SELECT,
  });

  await writeAuditLog({
    userId,
    action: input.isActive ? "recurring.activate" : "recurring.deactivate",
    metadata: { scheduleId, clientId: schedule.clientId },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return enrichSchedule(schedule);
}

/* -------------------------------------------------------------------------- */
/*                                   Delete                                   */
/* -------------------------------------------------------------------------- */

export async function deleteRecurringSchedule(
  req: Request,
  userId: string,
  scheduleId: string,
): Promise<void> {
  await findOwnedSchedule(userId, scheduleId);
  await assertNoLinkedInvoices(scheduleId);

  await prisma.recurringSchedule.delete({ where: { id: scheduleId } });

  await writeAuditLog({
    userId,
    action: "recurring.delete",
    metadata: { scheduleId },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });
}

/* -------------------------------------------------------------------------- */
/*                            Internal (future cron)                          */
/* -------------------------------------------------------------------------- */

/** Advance nextRunAt after a successful invoice generation run. */
export async function markScheduleRun(
  scheduleId: string,
  runAt: Date = new Date(),
): Promise<void> {
  const schedule = await prisma.recurringSchedule.findUnique({
    where: { id: scheduleId },
    select: { frequency: true, isActive: true },
  });
  if (!schedule?.isActive) return;

  await prisma.recurringSchedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: runAt,
      nextRunAt: computeNextRunAt(runAt, schedule.frequency),
    },
  });
}
