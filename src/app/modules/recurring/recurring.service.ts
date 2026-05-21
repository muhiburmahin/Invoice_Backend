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
import { assertClientBillable, createInvoiceFromTemplateInTransaction } from "../invoice/invoice.helpers";
import { getInvoiceDetail } from "../invoice/invoice.service";
import { getMyBusiness } from "../business/business.service";

import {
  RECURRING_DUE_SOON_DAYS,
  RECURRING_FREQUENCIES,
  RECURRING_INVOICE_SELECT,
  RECURRING_LIST_SELECT,
} from "./recurring.constants";
import {
  assertNoLinkedInvoices,
  enrichSchedule,
  findOwnedSchedule,
  findRecurringTemplateInvoice,
  markScheduleRunInTransaction,
} from "./recurring.helpers";
import type {
  CreateRecurringInput,
  ListRecurringQuery,
  RunRecurringInput,
  UpdateRecurringInput,
  UpdateRecurringStatusInput,
} from "./recurring.validation";

function resolveDueDate(
  issueDate: Date,
  dueDate: Date | undefined,
  defaultDueDays: number,
): Date {
  if (dueDate) return dueDate;
  const resolved = new Date(issueDate);
  resolved.setDate(resolved.getDate() + defaultDueDays);
  return resolved;
}

function assertDateOrder(issueDate: Date, dueDate: Date): void {
  if (dueDate.getTime() < issueDate.getTime()) {
    throw new ApiError(409, "Due date cannot be before the issue date", {
      code: "INVALID_DUE_DATE",
    });
  }
}

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
    requiresTemplateInvoice: true,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Generate invoice                              */
/* -------------------------------------------------------------------------- */

export async function executeRecurringScheduleRun(
  userId: string,
  scheduleId: string,
  input: RunRecurringInput = {},
  options?: {
    source?: "manual" | "scheduler";
    ipAddress?: string;
    userAgent?: string;
  },
) {
  const schedule = await findOwnedSchedule(userId, scheduleId);

  if (!schedule.isActive) {
    throw new ApiError(409, "Recurring schedule is inactive", {
      code: "RECURRING_INACTIVE",
    });
  }

  if (schedule.client.deletedAt || !schedule.client.isActive) {
    throw new ApiError(409, "Cannot run a schedule for an inactive client", {
      code: "CLIENT_NOT_BILLABLE",
    });
  }

  await assertWithinPlanLimits(userId, "invoices");
  await assertClientBillable(userId, schedule.clientId);

  const template = await findRecurringTemplateInvoice(userId, scheduleId);
  const business = await getMyBusiness(userId);
  const issueDate = input.issueDate ?? new Date();
  const dueDate = resolveDueDate(
    issueDate,
    input.dueDate,
    business.defaultDueDays,
  );
  assertDateOrder(issueDate, dueDate);

  const runAt = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const invoice = await createInvoiceFromTemplateInTransaction(
      tx,
      userId,
      template,
      {
        clientId: schedule.clientId,
        issueDate,
        dueDate,
        recurringId: scheduleId,
        isRecurring: true,
      },
    );

    await markScheduleRunInTransaction(tx, scheduleId, runAt);
    return invoice;
  });

  const updatedSchedule = await prisma.recurringSchedule.findUnique({
    where: { id: scheduleId },
    select: RECURRING_LIST_SELECT,
  });

  await writeAuditLog({
    userId,
    action: "recurring.run",
    invoiceId: created.id,
    metadata: {
      scheduleId,
      templateInvoiceId: template.id,
      invoiceNumber: created.number,
      nextRunAt: updatedSchedule?.nextRunAt.toISOString(),
      source: options?.source ?? "manual",
    },
    ipAddress: options?.ipAddress,
    userAgent: options?.userAgent,
  });

  return {
    invoice: created,
    schedule: updatedSchedule
      ? enrichSchedule(updatedSchedule)
      : enrichSchedule(schedule),
    templateInvoiceId: template.id,
  };
}

export async function runRecurringSchedule(
  req: Request,
  userId: string,
  scheduleId: string,
  input: RunRecurringInput = {},
) {
  const result = await executeRecurringScheduleRun(
    userId,
    scheduleId,
    input,
    {
      source: "manual",
      ipAddress: getRequestIp(req),
      userAgent: req.get("user-agent") ?? undefined,
    },
  );

  const invoice = await getInvoiceDetail(userId, result.invoice.id);

  return {
    invoice,
    schedule: result.schedule,
    templateInvoiceId: result.templateInvoiceId,
  };
}

/** Run all active schedules whose nextRunAt is due. Intended for cron/worker. */
export async function processDueRecurringSchedules(options?: {
  limit?: number;
}): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ scheduleId: string; userId: string; message: string }>;
}> {
  const now = new Date();
  const limit = options?.limit ?? 50;

  const dueSchedules = await prisma.recurringSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
      client: { deletedAt: null, isActive: true },
    },
    select: { id: true, userId: true },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });

  const errors: Array<{ scheduleId: string; userId: string; message: string }> =
    [];
  let succeeded = 0;

  for (const schedule of dueSchedules) {
    try {
      await executeRecurringScheduleRun(schedule.userId, schedule.id, {}, {
        source: "scheduler",
      });
      succeeded += 1;
    } catch (error) {
      errors.push({
        scheduleId: schedule.id,
        userId: schedule.userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    processed: dueSchedules.length,
    succeeded,
    failed: errors.length,
    errors,
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
  await prisma.$transaction(async (tx) => {
    await markScheduleRunInTransaction(tx, scheduleId, runAt);
  });
}
