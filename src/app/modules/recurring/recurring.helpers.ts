import {
  addMonths,
  addWeeks,
  addYears,
  startOfDay,
} from "date-fns";

import type { RecurringFrequency, Prisma } from "@prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";

import { RECURRING_DUE_SOON_DAYS, RECURRING_LIST_SELECT } from "./recurring.constants";

export function computeNextRunAt(
  from: Date,
  frequency: RecurringFrequency,
): Date {
  switch (frequency) {
    case "WEEKLY":
      return addWeeks(from, 1);
    case "BIWEEKLY":
      return addWeeks(from, 2);
    case "MONTHLY":
      return addMonths(from, 1);
    case "QUARTERLY":
      return addMonths(from, 3);
    case "YEARLY":
      return addYears(from, 1);
    default:
      return addMonths(from, 1);
  }
}

export function isScheduleOverdue(nextRunAt: Date, isActive: boolean): boolean {
  return isActive && nextRunAt.getTime() < Date.now();
}

export function isScheduleDueSoon(
  nextRunAt: Date,
  isActive: boolean,
  withinDays: number,
): boolean {
  if (!isActive) return false;
  const now = startOfDay(new Date()).getTime();
  const due = startOfDay(nextRunAt).getTime();
  const windowEnd = now + withinDays * 24 * 60 * 60 * 1000;
  return due >= now && due <= windowEnd;
}

type ScheduleRow = {
  nextRunAt: Date;
  isActive: boolean;
};

export function enrichSchedule<T extends ScheduleRow>(row: T) {
  return {
    ...row,
    isOverdue: isScheduleOverdue(row.nextRunAt, row.isActive),
    isDueSoon: isScheduleDueSoon(
      row.nextRunAt,
      row.isActive,
      RECURRING_DUE_SOON_DAYS,
    ),
  };
}

export async function findOwnedSchedule(userId: string, scheduleId: string) {
  const schedule = await prisma.recurringSchedule.findFirst({
    where: { id: scheduleId, userId },
    select: {
      ...RECURRING_LIST_SELECT,
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          company: true,
          deletedAt: true,
          isActive: true,
        },
      },
    },
  });

  if (!schedule) {
    throw new ApiError(404, "Recurring schedule not found", {
      code: "RECURRING_NOT_FOUND",
    });
  }

  return schedule;
}

export async function assertNoLinkedInvoices(scheduleId: string): Promise<void> {
  const linked = await prisma.invoice.count({
    where: { recurringId: scheduleId, deletedAt: null },
  });

  if (linked > 0) {
    throw new ApiError(
      409,
      "Cannot delete a recurring schedule with linked invoices. Deactivate it instead.",
      {
        code: "RECURRING_HAS_INVOICES",
        details: { linkedInvoices: linked },
      },
    );
  }
}

export async function assertRecurringScheduleLink(
  userId: string,
  scheduleId: string,
  clientId: string,
): Promise<void> {
  const schedule = await prisma.recurringSchedule.findFirst({
    where: { id: scheduleId, userId },
    select: { clientId: true },
  });

  if (!schedule) {
    throw new ApiError(404, "Recurring schedule not found", {
      code: "RECURRING_NOT_FOUND",
    });
  }

  if (schedule.clientId !== clientId) {
    throw new ApiError(
      409,
      "Invoice client must match the recurring schedule client",
      {
        code: "RECURRING_CLIENT_MISMATCH",
        details: { scheduleClientId: schedule.clientId, clientId },
      },
    );
  }
}

export async function findRecurringTemplateInvoice(
  userId: string,
  scheduleId: string,
) {
  const template = await prisma.invoice.findFirst({
    where: { recurringId: scheduleId, userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { order: "asc" } } },
  });

  if (!template) {
    throw new ApiError(
      409,
      "No template invoice found for this schedule. Create an invoice linked to this schedule first.",
      { code: "RECURRING_NO_TEMPLATE" },
    );
  }

  return template;
}

export async function markScheduleRunInTransaction(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  runAt: Date = new Date(),
): Promise<void> {
  const schedule = await tx.recurringSchedule.findUnique({
    where: { id: scheduleId },
    select: { frequency: true, isActive: true },
  });
  if (!schedule?.isActive) return;

  await tx.recurringSchedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: runAt,
      nextRunAt: computeNextRunAt(runAt, schedule.frequency),
    },
  });
}
