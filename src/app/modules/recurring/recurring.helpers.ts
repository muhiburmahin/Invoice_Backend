import {
  addMonths,
  addWeeks,
  addYears,
  startOfDay,
} from "date-fns";

import type { RecurringFrequency } from "../../../generated/prisma/client";
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
