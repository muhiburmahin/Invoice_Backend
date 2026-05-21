import type { RecurringFrequency } from "../../../generated/prisma/client";

export const RECURRING_ROUTES = {
  list: "/",
  stats: "/stats",
  meta: "/meta",
  byId: "/:id",
  status: "/:id/status",
  invoices: "/:id/invoices",
} as const;

export const RECURRING_FREQUENCIES = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
] as const satisfies readonly RecurringFrequency[];

/** Days ahead to flag a schedule as "due soon" in stats. */
export const RECURRING_DUE_SOON_DAYS = 7;

export const RECURRING_LIST_SELECT = {
  id: true,
  clientId: true,
  frequency: true,
  nextRunAt: true,
  lastRunAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  client: {
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
    },
  },
  _count: {
    select: {
      invoices: { where: { deletedAt: null } },
    },
  },
} as const;

export const RECURRING_INVOICE_SELECT = {
  id: true,
  number: true,
  status: true,
  total: true,
  currency: true,
  issueDate: true,
  dueDate: true,
  isRecurring: true,
  createdAt: true,
} as const;
