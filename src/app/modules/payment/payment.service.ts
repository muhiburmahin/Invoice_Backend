import type { Request } from "express";
import { startOfMonth } from "date-fns";

import { getMonthBuckets } from "../../../utils/monthBuckets";

import type { PaymentStatus, Prisma } from "../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";
import { buildPaginationMeta } from "../../shared/pagination";
import { writeAuditLog } from "../../services/audit/auditLog.service";
import { notifyAfterPaymentComplete } from "../../services/notification";
import { getRequestIp } from "../auth/auth.helpers";
import { roundMoney } from "../invoice/invoice.helpers";

import {
  ALLOWED_PAYMENT_STATUS_TRANSITIONS,
  MANUAL_PAYMENT_METHODS,
  PAYABLE_INVOICE_STATUSES,
  PAYMENT_LIST_SELECT,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "./payment.constants";
import { createInvoiceStripeCheckout, getStripeCheckoutMeta } from "../../services/billing/stripeCheckout.service";
import { config } from "../../config";
import {
  assertCanCompletePayment,
  assertPayableInvoice,
  assertPaymentAmount,
  assertStripeAvailable,
  findOwnedInvoiceForPayment,
  findOwnedPayment,
  getInvoicePaymentSnapshot,
  syncInvoiceFromPayments,
} from "./payment.helpers";
import type {
  CreatePaymentInput,
  ListPaymentsQuery,
  StripeCheckoutInput,
  UpdatePaymentStatusInput,
} from "./payment.validation";

function normaliseNullable(v: string | null | undefined): string | null {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}

function assertPaymentStatusTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (from === to) {
    throw new ApiError(409, `Payment is already ${to}`, {
      code: "STATUS_UNCHANGED",
    });
  }
  const allowed = ALLOWED_PAYMENT_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ApiError(
      409,
      `Cannot change payment status from ${from} to ${to}`,
      {
        code: "INVALID_PAYMENT_STATUS_TRANSITION",
        details: { from, to, allowed },
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                   */
/* -------------------------------------------------------------------------- */

export async function recordPayment(
  req: Request,
  userId: string,
  input: CreatePaymentInput,
) {
  const invoice = await findOwnedInvoiceForPayment(userId, input.invoiceId);
  assertPayableInvoice(invoice);
  assertPaymentAmount(input.amount, invoice.balanceDue);

  if (input.currency && input.currency !== invoice.currency) {
    throw new ApiError(
      409,
      `Payment currency must match the invoice currency (${invoice.currency})`,
      { code: "CURRENCY_MISMATCH" },
    );
  }

  const isManual = MANUAL_PAYMENT_METHODS.includes(
    input.method as (typeof MANUAL_PAYMENT_METHODS)[number],
  );

  if (input.method === "STRIPE") {
    assertStripeAvailable();
    throw new ApiError(
      400,
      "Use POST /payments/stripe/checkout to pay via Stripe.",
      { code: "STRIPE_USE_CHECKOUT" },
    );
  }

  const status: PaymentStatus = isManual ? "COMPLETED" : "PENDING";
  const paidAt = isManual ? (input.paidAt ?? new Date()) : null;

  const payment = await prisma.$transaction(async (tx) => {
    if (status === "COMPLETED") {
      await assertCanCompletePayment(tx, input.invoiceId, input.amount);
    }

    const created = await tx.payment.create({
      data: {
        invoiceId: input.invoiceId,
        amount: roundMoney(input.amount),
        currency: invoice.currency,
        status,
        method: input.method,
        note: normaliseNullable(input.note),
        paidAt,
      },
      select: PAYMENT_LIST_SELECT,
    });

    if (status === "COMPLETED") {
      await syncInvoiceFromPayments(tx, input.invoiceId);
    }

    const invoiceSnapshot = await getInvoicePaymentSnapshot(tx, input.invoiceId);

    return { payment: created, invoice: invoiceSnapshot };
  });

  await writeAuditLog({
    userId,
    action: "payment.record",
    invoiceId: input.invoiceId,
    metadata: {
      paymentId: payment.payment.id,
      amount: payment.payment.amount,
      method: payment.payment.method,
      invoiceStatus: payment.invoice?.status,
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  if (status === "COMPLETED" && payment.invoice) {
    await notifyAfterPaymentComplete({
      userId,
      invoiceId: input.invoiceId,
      paymentId: payment.payment.id,
      amount: payment.payment.amount,
      currency: payment.payment.currency,
      method: payment.payment.method,
      invoiceNumber: payment.invoice.number,
      invoiceStatus: payment.invoice.status,
      invoiceTotal: payment.invoice.total,
    });
  }

  return payment;
}

/* -------------------------------------------------------------------------- */
/*                                    List                                    */
/* -------------------------------------------------------------------------- */

export async function listPayments(userId: string, query: ListPaymentsQuery) {
  const where: Prisma.PaymentWhereInput = {
    invoice: { userId, deletedAt: null },
  };

  if (query.invoiceId) where.invoiceId = query.invoiceId;
  if (query.status) where.status = query.status;
  if (query.method) where.method = query.method;
  if (query.fromDate || query.toDate) {
    where.createdAt = {};
    if (query.fromDate) where.createdAt.gte = query.fromDate;
    if (query.toDate) where.createdAt.lte = query.toDate;
  }

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip,
      take: query.limit,
      select: PAYMENT_LIST_SELECT,
    }),
  ]);

  return { rows, meta: buildPaginationMeta(total, query) };
}

export async function listInvoicePayments(
  userId: string,
  invoiceId: string,
) {
  const invoice = await findOwnedInvoiceForPayment(userId, invoiceId);

  const payments = await prisma.payment.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" },
    select: PAYMENT_LIST_SELECT,
  });

  const freshInvoice = await prisma.invoice.findUnique({
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

  const summary = await prisma.payment.groupBy({
    by: ["status"],
    where: { invoiceId },
    _count: { _all: true },
    _sum: { amount: true },
  });

  const byStatus = summary.reduce<Record<string, { count: number; amount: number }>>(
    (acc, row) => {
      acc[row.status] = {
        count: row._count._all,
        amount: row._sum.amount ?? 0,
      };
      return acc;
    },
    {},
  );

  return {
    invoice: freshInvoice ?? {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      total: invoice.total,
      paidAmount: invoice.paidAmount,
      balanceDue: invoice.balanceDue,
      currency: invoice.currency,
    },
    payments,
    summary: byStatus,
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Stats                                    */
/* -------------------------------------------------------------------------- */

const PAYMENT_CHART_MONTHS = 6;

export async function getPaymentStats(userId: string) {
  const monthStart = startOfMonth(new Date());
  const monthBuckets = getMonthBuckets(PAYMENT_CHART_MONTHS);

  const [
    total,
    thisMonth,
    completedSum,
    completedThisMonth,
    pendingSum,
    methodGroups,
    monthlyRevenueSums,
  ] = await Promise.all([
      prisma.payment.count({
        where: { invoice: { userId, deletedAt: null } },
      }),
      prisma.payment.count({
        where: {
          invoice: { userId, deletedAt: null },
          createdAt: { gte: monthStart },
        },
      }),
      prisma.payment.aggregate({
        where: {
          invoice: { userId, deletedAt: null },
          status: "COMPLETED",
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          invoice: { userId, deletedAt: null },
          status: "COMPLETED",
          paidAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          invoice: { userId, deletedAt: null },
          status: "PENDING",
        },
        _sum: { amount: true },
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: {
          invoice: { userId, deletedAt: null },
          status: "COMPLETED",
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      Promise.all(
        monthBuckets.map((bucket) =>
          prisma.payment.aggregate({
            where: {
              invoice: { userId, deletedAt: null },
              status: "COMPLETED",
              paidAt: { gte: bucket.start, lt: bucket.end },
            },
            _sum: { amount: true },
          }),
        ),
      ),
    ]);

  const byMethod = methodGroups.reduce<
    Record<string, { count: number; amount: number }>
  >((acc, row) => {
    acc[row.method] = {
      count: row._count._all,
      amount: row._sum.amount ?? 0,
    };
    return acc;
  }, {});

  return {
    total,
    thisMonth,
    completedTotal: completedSum._sum.amount ?? 0,
    completedThisMonth: completedThisMonth._sum.amount ?? 0,
    pendingTotal: pendingSum._sum.amount ?? 0,
    byMethod,
    monthlyTrend: monthBuckets.map((bucket, i) => ({
      label: bucket.label,
      key: bucket.key,
      amount: monthlyRevenueSums[i]?._sum.amount ?? 0,
    })),
  };
}

export function getPaymentMeta() {
  const stripe = getStripeCheckoutMeta();
  return {
    methods: PAYMENT_METHODS,
    statuses: PAYMENT_STATUSES,
    transitions: ALLOWED_PAYMENT_STATUS_TRANSITIONS,
    manualMethods: MANUAL_PAYMENT_METHODS,
    payableInvoiceStatuses: PAYABLE_INVOICE_STATUSES,
    stripeConfigured: stripe.configured,
    stripeCheckoutAvailable: stripe.checkoutAvailable,
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Detail                                   */
/* -------------------------------------------------------------------------- */

export async function getPaymentDetail(userId: string, paymentId: string) {
  const payment = await findOwnedPayment(userId, paymentId);
  return {
    payment,
    allowedTransitions:
      ALLOWED_PAYMENT_STATUS_TRANSITIONS[payment.status] ?? [],
  };
}

/* -------------------------------------------------------------------------- */
/*                              Status update                                 */
/* -------------------------------------------------------------------------- */

export async function updatePaymentStatus(
  req: Request,
  userId: string,
  paymentId: string,
  input: UpdatePaymentStatusInput,
) {
  const current = await findOwnedPayment(userId, paymentId);

  assertPaymentStatusTransition(current.status, input.status);

  const updated = await prisma.$transaction(async (tx) => {
    if (input.status === "COMPLETED") {
      await assertCanCompletePayment(
        tx,
        current.invoiceId,
        current.amount,
        paymentId,
      );
    }

    const payment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: input.status,
        ...(input.note !== undefined
          ? { note: normaliseNullable(input.note) }
          : {}),
        ...(input.status === "COMPLETED"
          ? { paidAt: current.paidAt ?? new Date() }
          : {}),
        ...(input.status === "REFUNDED" || input.status === "FAILED"
          ? { paidAt: null }
          : {}),
      },
      select: PAYMENT_LIST_SELECT,
    });

    await syncInvoiceFromPayments(tx, current.invoiceId);
    const invoice = await getInvoicePaymentSnapshot(tx, current.invoiceId);

    return { payment, invoice };
  });

  await writeAuditLog({
    userId,
    action: "payment.status_change",
    invoiceId: current.invoiceId,
    metadata: {
      paymentId,
      from: current.status,
      to: input.status,
      amount: current.amount,
      invoiceStatus: updated.invoice?.status,
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  if (input.status === "COMPLETED" && updated.invoice) {
    await notifyAfterPaymentComplete({
      userId,
      invoiceId: current.invoiceId,
      paymentId,
      amount: current.amount,
      currency: current.invoice.currency,
      method: current.method,
      invoiceNumber: updated.invoice.number,
      invoiceStatus: updated.invoice.status,
      invoiceTotal: updated.invoice.total,
    });
  }

  return {
    payment: updated.payment,
    invoice: updated.invoice,
    allowedTransitions:
      ALLOWED_PAYMENT_STATUS_TRANSITIONS[updated.payment.status] ?? [],
  };
}

/* -------------------------------------------------------------------------- */
/*                            Stripe checkout                                 */
/* -------------------------------------------------------------------------- */

export async function createStripeCheckout(
  userId: string,
  input: StripeCheckoutInput,
) {
  const base = config.clientUrl.replace(/\/$/, "");
  const invoicePath = `${base}/invoices/${input.invoiceId}`;

  return createInvoiceStripeCheckout({
    userId,
    invoiceId: input.invoiceId,
    amount: input.amount,
    successUrl: `${invoicePath}?payment=success`,
    cancelUrl: `${invoicePath}?payment=cancelled`,
  });
}

/* -------------------------------------------------------------------------- */
/*                              Cancel pending                                */
/* -------------------------------------------------------------------------- */

export async function cancelPayment(
  req: Request,
  userId: string,
  paymentId: string,
): Promise<void> {
  const current = await findOwnedPayment(userId, paymentId);

  if (current.status !== "PENDING") {
    throw new ApiError(409, "Only pending payments can be cancelled", {
      code: "PAYMENT_NOT_CANCELLABLE",
      details: { status: current.status },
    });
  }

  await prisma.payment.delete({ where: { id: paymentId } });

  await writeAuditLog({
    userId,
    action: "payment.cancel",
    invoiceId: current.invoiceId,
    metadata: { paymentId, amount: current.amount },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });
}
