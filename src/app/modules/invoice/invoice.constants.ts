import type { InvoiceStatus } from "../../../generated/prisma/client";

export const INVOICE_ROUTES = {
  list: "/",
  stats: "/stats",
  meta: "/meta",
  byId: "/:id",
  status: "/:id/status",
  duplicate: "/:id/duplicate",
} as const;

export const INVOICE_POLICY = {
  notes: { max: 2_000 },
  terms: { max: 2_000 },
  footer: { max: 1_000 },
  itemDescription: { max: 500 },
  itemUnit: { max: 30 },
  items: { min: 1, max: 100 },
  quantity: { min: 0.01, max: 999_999 },
  rate: { min: 0, max: 99_999_999 },
  taxRate: { min: 0, max: 100 },
  discount: { min: 0, max: 99_999_999 },
} as const;

/** Statuses where the full invoice (items, amounts, client) can be edited. */
export const EDITABLE_STATUSES: InvoiceStatus[] = ["DRAFT"];

/** Statuses eligible for soft delete. */
export const DELETABLE_STATUSES: InvoiceStatus[] = ["DRAFT", "CANCELLED"];

/**
 * Allowed manual status transitions. Payment webhooks will also drive
 * PAID / PARTIALLY_PAID later — this map is the guard for admin/user actions.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<
  InvoiceStatus,
  readonly InvoiceStatus[]
> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["VIEWED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"],
  VIEWED: ["PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "REFUNDED"],
  PAID: ["REFUNDED"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "CANCELLED"],
  CANCELLED: ["DRAFT"],
  REFUNDED: [],
};

export const INVOICE_LIST_SELECT = {
  id: true,
  number: true,
  status: true,
  clientId: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  taxRate: true,
  taxAmount: true,
  discount: true,
  discountType: true,
  total: true,
  paidAmount: true,
  balanceDue: true,
  currency: true,
  sentAt: true,
  viewedAt: true,
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
} as const;

export const INVOICE_STATUSES = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "REFUNDED",
] as const;
