import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";

import type {
  NotificationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../shared/prisma";

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Prisma.InputJsonValue;
};

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data,
    },
  });
}

export async function notifyInvoiceViewed(params: {
  userId: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  via?: string;
}) {
  return createNotification({
    userId: params.userId,
    type: "INVOICE_VIEWED",
    title: "Invoice viewed",
    message: `${params.clientName} viewed invoice ${params.invoiceNumber}.`,
    data: {
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      clientName: params.clientName,
      via: params.via ?? "portal",
    },
  });
}

export async function notifyPaymentReceived(params: {
  userId: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string;
  amount: number;
  currency: string;
  method: string;
}) {
  return createNotification({
    userId: params.userId,
    type: "PAYMENT_RECEIVED",
    title: "Payment received",
    message: `Received ${params.amount} ${params.currency} for invoice ${params.invoiceNumber}.`,
    data: {
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      paymentId: params.paymentId,
      amount: params.amount,
      currency: params.currency,
      method: params.method,
    },
  });
}

export async function notifyInvoicePaid(params: {
  userId: string;
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  currency: string;
}) {
  return createNotification({
    userId: params.userId,
    type: "INVOICE_PAID",
    title: "Invoice paid in full",
    message: `Invoice ${params.invoiceNumber} has been paid in full (${params.total} ${params.currency}).`,
    data: {
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      total: params.total,
      currency: params.currency,
    },
  });
}

export async function notifyReminderSent(params: {
  userId: string;
  invoiceId: string;
  invoiceNumber: string;
  recipient: string;
}) {
  return createNotification({
    userId: params.userId,
    type: "REMINDER_SENT",
    title: "Payment reminder sent",
    message: `A payment reminder for invoice ${params.invoiceNumber} was sent to ${params.recipient}.`,
    data: {
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      recipient: params.recipient,
    },
  });
}

export async function notifyInvoiceOverdue(params: {
  userId: string;
  invoiceId: string;
  invoiceNumber: string;
  balanceDue: number;
  currency: string;
  dueDate: Date;
}) {
  return createNotification({
    userId: params.userId,
    type: "INVOICE_OVERDUE",
    title: "Invoice overdue",
    message: `Invoice ${params.invoiceNumber} is overdue (${params.balanceDue} ${params.currency} outstanding).`,
    data: {
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      balanceDue: params.balanceDue,
      currency: params.currency,
      dueDate: params.dueDate.toISOString(),
    },
  });
}

export async function notifySubscriptionExpiring(params: {
  userId: string;
  plan: string;
  currentPeriodEnd: Date;
  daysRemaining: number;
}) {
  return createNotification({
    userId: params.userId,
    type: "SUBSCRIPTION_EXPIRING",
    title: "Subscription expiring soon",
    message: `Your ${params.plan} plan expires in ${params.daysRemaining} day${params.daysRemaining === 1 ? "" : "s"}.`,
    data: {
      plan: params.plan,
      currentPeriodEnd: params.currentPeriodEnd.toISOString(),
      daysRemaining: params.daysRemaining,
    },
  });
}

export async function notifySubscriptionCancelled(params: {
  userId: string;
  plan: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: Date | null;
}) {
  const message = params.cancelAtPeriodEnd
    ? `Your ${params.plan} subscription will cancel at the end of the current billing period.`
    : `Your ${params.plan} subscription has been cancelled.`;

  return createNotification({
    userId: params.userId,
    type: "SUBSCRIPTION_CANCELLED",
    title: "Subscription cancelled",
    message,
    data: {
      plan: params.plan,
      cancelAtPeriodEnd: params.cancelAtPeriodEnd,
      currentPeriodEnd: params.currentPeriodEnd?.toISOString() ?? null,
    },
  });
}

export async function notifyAfterPaymentComplete(params: {
  userId: string;
  invoiceId: string;
  paymentId: string;
  amount: number;
  currency: string;
  method: string;
  invoiceNumber: string;
  invoiceStatus: string | null | undefined;
  invoiceTotal?: number | null;
}) {
  await notifyPaymentReceived({
    userId: params.userId,
    invoiceId: params.invoiceId,
    invoiceNumber: params.invoiceNumber,
    paymentId: params.paymentId,
    amount: params.amount,
    currency: params.currency,
    method: params.method,
  });

  if (params.invoiceStatus === "PAID") {
    await notifyInvoicePaid({
      userId: params.userId,
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      total: params.invoiceTotal ?? params.amount,
      currency: params.currency,
    });
  }
}

/** Mark past-due invoices as overdue and notify owners. Intended for a scheduled job. */
export async function processOverdueInvoices(): Promise<number> {
  const now = new Date();

  const candidates = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      dueDate: { lt: now },
      balanceDue: { gt: 0 },
      status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] },
    },
    select: {
      id: true,
      userId: true,
      number: true,
      balanceDue: true,
      currency: true,
      dueDate: true,
    },
  });

  let processed = 0;

  for (const invoice of candidates) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "OVERDUE" },
    });

    await notifyInvoiceOverdue({
      userId: invoice.userId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      balanceDue: invoice.balanceDue,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
    });

    processed += 1;
  }

  return processed;
}

/** Notify users whose subscription period ends within `daysBefore` days. */
export async function processSubscriptionExpiryReminders(
  daysBefore = 7,
): Promise<number> {
  const today = startOfDay(new Date());
  const horizon = addDays(today, daysBefore);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING"] },
      cancelAtPeriodEnd: false,
      currentPeriodEnd: {
        gte: today,
        lte: horizon,
      },
    },
    select: {
      userId: true,
      plan: true,
      currentPeriodEnd: true,
    },
  });

  let processed = 0;

  for (const subscription of subscriptions) {
    if (!subscription.currentPeriodEnd) continue;

    const daysRemaining = differenceInCalendarDays(
      startOfDay(subscription.currentPeriodEnd),
      today,
    );
    if (daysRemaining < 0) continue;

    const existing = await prisma.notification.findFirst({
      where: {
        userId: subscription.userId,
        type: "SUBSCRIPTION_EXPIRING",
        createdAt: { gte: addDays(today, -1) },
        data: {
          path: ["currentPeriodEnd"],
          equals: subscription.currentPeriodEnd.toISOString(),
        },
      },
      select: { id: true },
    });
    if (existing) continue;

    await notifySubscriptionExpiring({
      userId: subscription.userId,
      plan: subscription.plan,
      currentPeriodEnd: subscription.currentPeriodEnd,
      daysRemaining,
    });

    processed += 1;
  }

  return processed;
}
