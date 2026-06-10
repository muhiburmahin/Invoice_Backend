import type { InvoiceStatus, PaymentStatus } from "@prisma/client";

export const PAYMENT_ROUTES = {
  list: "/",
  stats: "/stats",
  meta: "/meta",
  stripeCheckout: "/stripe/checkout",
  byId: "/:id",
  status: "/:id/status",
} as const;

/** Invoice statuses that accept new payments. */
export const PAYABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  "SENT",
  "VIEWED",
  "PARTIALLY_PAID",
  "OVERDUE",
];

export const PAYMENT_POLICY = {
  note: { max: 500 },
  amount: { min: 0.01, max: 99_999_999 },
} as const;

export const PAYMENT_METHODS = [
  "STRIPE",
  "BANK_TRANSFER",
  "CASH",
  "CHECK",
  "OTHER",
] as const;

export const PAYMENT_STATUSES = [
  "PENDING",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
  "DISPUTED",
] as const;

/** Manual methods recorded as immediately completed by default. */
export const MANUAL_PAYMENT_METHODS = [
  "BANK_TRANSFER",
  "CASH",
  "CHECK",
  "OTHER",
] as const;

export const ALLOWED_PAYMENT_STATUS_TRANSITIONS: Record<
  PaymentStatus,
  readonly PaymentStatus[]
> = {
  PENDING: ["COMPLETED", "FAILED"],
  COMPLETED: ["REFUNDED", "DISPUTED"],
  FAILED: [],
  REFUNDED: [],
  DISPUTED: ["COMPLETED", "REFUNDED"],
};

export const PAYMENT_LIST_SELECT = {
  id: true,
  invoiceId: true,
  amount: true,
  currency: true,
  status: true,
  method: true,
  note: true,
  paidAt: true,
  createdAt: true,
  invoice: {
    select: {
      id: true,
      number: true,
      total: true,
      balanceDue: true,
      status: true,
      client: {
        select: { id: true, name: true, email: true },
      },
    },
  },
} as const;
