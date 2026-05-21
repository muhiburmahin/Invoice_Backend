import type { Prisma } from "../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { isStripeConfigured } from "../../services/billing/stripe.client";
import { prisma } from "../../shared/prisma";
import { roundMoney } from "../invoice/invoice.helpers";

import { PAYABLE_INVOICE_STATUSES } from "./payment.constants";

export function assertPayableInvoice(invoice: {
  status: string;
  deletedAt: Date | null;
  balanceDue: number;
}): void {
  if (invoice.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }
  if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status as never)) {
    throw new ApiError(
      409,
      `Payments cannot be recorded on a ${invoice.status} invoice`,
      {
        code: "INVOICE_NOT_PAYABLE",
        details: { status: invoice.status, allowed: PAYABLE_INVOICE_STATUSES },
      },
    );
  }
  if (invoice.balanceDue <= 0) {
    throw new ApiError(409, "Invoice has no outstanding balance", {
      code: "INVOICE_ALREADY_PAID",
    });
  }
}

export function assertPaymentAmount(amount: number, balanceDue: number): void {
  if (amount <= 0) {
    throw new ApiError(400, "Payment amount must be greater than zero", {
      code: "INVALID_PAYMENT_AMOUNT",
    });
  }
  if (amount > balanceDue) {
    throw new ApiError(
      409,
      `Payment amount cannot exceed the outstanding balance (${balanceDue})`,
      {
        code: "PAYMENT_EXCEEDS_BALANCE",
        details: { amount, balanceDue },
      },
    );
  }
}

/**
 * Recalculate invoice paidAmount, balanceDue, and status from completed
 * payments. Called inside a transaction after every payment mutation.
 */
export async function syncInvoiceFromPayments(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, total: true, status: true, deletedAt: true },
  });
  if (!invoice || invoice.deletedAt) return;

  const [completed, refundedCount] = await Promise.all([
    tx.payment.aggregate({
      where: { invoiceId, status: "COMPLETED" },
      _sum: { amount: true },
    }),
    tx.payment.count({ where: { invoiceId, status: "REFUNDED" } }),
  ]);

  const paidAmount = roundMoney(completed._sum.amount ?? 0);
  const balanceDue = roundMoney(Math.max(0, invoice.total - paidAmount));

  let status = invoice.status;
  const canAutoUpdate =
    PAYABLE_INVOICE_STATUSES.includes(status as never) ||
    status === "PARTIALLY_PAID" ||
    status === "PAID" ||
    status === "REFUNDED";

  if (canAutoUpdate) {
    if (balanceDue <= 0 && paidAmount >= invoice.total) {
      status = "PAID";
    } else if (paidAmount > 0 && balanceDue > 0) {
      status = "PARTIALLY_PAID";
    } else if (paidAmount === 0) {
      status =
        refundedCount > 0 &&
        (invoice.status === "PAID" ||
          invoice.status === "PARTIALLY_PAID" ||
          invoice.status === "REFUNDED")
          ? "REFUNDED"
          : "SENT";
    }
  }

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { paidAmount, balanceDue, status },
  });
}

/** Guard against completing a pending payment that would overpay the invoice. */
export async function assertCanCompletePayment(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  paymentAmount: number,
  excludePaymentId?: string,
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { total: true, deletedAt: true },
  });
  if (!invoice || invoice.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  const completed = await tx.payment.aggregate({
    where: {
      invoiceId,
      status: "COMPLETED",
      ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
    },
    _sum: { amount: true },
  });

  const projectedPaid = roundMoney(
    (completed._sum.amount ?? 0) + paymentAmount,
  );
  if (projectedPaid > invoice.total) {
    throw new ApiError(
      409,
      "Completing this payment would exceed the invoice total",
      {
        code: "PAYMENT_EXCEEDS_BALANCE",
        details: {
          paymentAmount,
          projectedPaid,
          invoiceTotal: invoice.total,
        },
      },
    );
  }
}

export async function getInvoicePaymentSnapshot(
  tx: Prisma.TransactionClient,
  invoiceId: string,
) {
  return tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      paidAmount: true,
      balanceDue: true,
      currency: true,
    },
  });
}

export async function findOwnedPayment(userId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, invoice: { userId, deletedAt: null } },
    include: {
      invoice: {
        select: {
          id: true,
          number: true,
          userId: true,
          total: true,
          balanceDue: true,
          paidAmount: true,
          status: true,
          currency: true,
          deletedAt: true,
        },
      },
    },
  });
  if (!payment) {
    throw new ApiError(404, "Payment not found", { code: "PAYMENT_NOT_FOUND" });
  }
  return payment;
}

export async function findOwnedInvoiceForPayment(
  userId: string,
  invoiceId: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId, deletedAt: null },
    select: {
      id: true,
      number: true,
      total: true,
      balanceDue: true,
      paidAmount: true,
      status: true,
      currency: true,
      deletedAt: true,
    },
  });
  if (!invoice) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }
  return invoice;
}

export function assertStripeAvailable(): void {
  if (!isStripeConfigured()) {
    throw new ApiError(503, "Stripe is not configured", {
      code: "STRIPE_NOT_CONFIGURED",
    });
  }
}
