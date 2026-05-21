import type Stripe from "stripe";
import type { Request } from "express";

import { ApiError } from "../../errors/ApiError";
import { config } from "../../config";
import { features } from "../../config/features";
import { prisma } from "../../shared/prisma";
import { writeAuditLog } from "../audit/auditLog.service";
import { notifyAfterPaymentComplete } from "../notification";
import { roundMoney } from "../../modules/invoice/invoice.helpers";
import {
  assertCanCompletePayment,
  assertPayableInvoice,
  assertPaymentAmount,
  assertStripeAvailable,
  syncInvoiceFromPayments,
} from "../../modules/payment/payment.helpers";
import { getStripeClient, isStripeConfigured } from "./stripe.client";
import { toStripeMinorUnits } from "./stripeAmount";

function assertStripeBillingEnabled(): void {
  if (!features.isBillingEnabled()) {
    throw new ApiError(503, "Billing is disabled", { code: "BILLING_DISABLED" });
  }
  assertStripeAvailable();
}

async function failPendingStripePayments(invoiceId: string): Promise<void> {
  await prisma.payment.updateMany({
    where: {
      invoiceId,
      method: "STRIPE",
      status: "PENDING",
    },
    data: { status: "FAILED" },
  });
}

export async function createInvoiceStripeCheckout(input: {
  userId: string;
  invoiceId: string;
  amount?: number;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{
  checkoutUrl: string;
  sessionId: string;
  paymentId: string;
  amount: number;
}> {
  assertStripeBillingEnabled();

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, userId: input.userId, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      balanceDue: true,
      currency: true,
      deletedAt: true,
      client: {
        select: { email: true, name: true },
      },
      user: {
        select: {
          business: { select: { name: true } },
        },
      },
    },
  });

  if (!invoice) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  assertPayableInvoice(invoice);

  const amount = roundMoney(input.amount ?? invoice.balanceDue);
  assertPaymentAmount(amount, invoice.balanceDue);

  await failPendingStripePayments(invoice.id);

  const stripe = getStripeClient();

  const payment = await prisma.$transaction(async (tx) => {
    await assertCanCompletePayment(tx, invoice.id, amount);

    return tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amount,
        currency: invoice.currency,
        status: "PENDING",
        method: "STRIPE",
        note: "Stripe checkout",
      },
      select: { id: true, amount: true },
    });
  });

  const unitAmount = toStripeMinorUnits(payment.amount, invoice.currency);
  if (unitAmount < 1) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    throw new ApiError(400, "Payment amount is too small for Stripe", {
      code: "INVALID_PAYMENT_AMOUNT",
    });
  }

  const businessName = invoice.user.business?.name ?? "Invoice";
  const productName = `Invoice ${invoice.number}`;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: input.customerEmail ?? invoice.client.email,
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: productName,
              description: `Payment to ${businessName}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        userId: input.userId,
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    throw error;
  }

  if (!session.url) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    throw new ApiError(502, "Stripe did not return a checkout URL", {
      code: "STRIPE_CHECKOUT_FAILED",
    });
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { stripeSessionId: session.id },
  });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    paymentId: payment.id,
    amount: payment.amount,
  };
}

async function completeStripePayment(input: {
  paymentId: string;
  stripeSessionId: string;
  stripePaymentId: string | null;
}): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      invoiceId: true,
      amount: true,
      status: true,
      currency: true,
      method: true,
      invoice: { select: { userId: true, number: true, total: true } },
    },
  });

  if (!payment) return;
  if (payment.status === "COMPLETED") return;

  await prisma.$transaction(async (tx) => {
    await assertCanCompletePayment(
      tx,
      payment.invoiceId,
      payment.amount,
      payment.id,
    );

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "COMPLETED",
        stripeSessionId: input.stripeSessionId,
        stripePaymentId: input.stripePaymentId,
        paidAt: new Date(),
      },
    });

    await syncInvoiceFromPayments(tx, payment.invoiceId);
  });

  const invoiceSnapshot = await prisma.invoice.findUnique({
    where: { id: payment.invoiceId },
    select: {
      status: true,
      total: true,
    },
  });

  await writeAuditLog({
    userId: payment.invoice.userId,
    action: "payment.stripe_complete",
    invoiceId: payment.invoiceId,
    metadata: {
      paymentId: payment.id,
      stripeSessionId: input.stripeSessionId,
      stripePaymentId: input.stripePaymentId,
      amount: payment.amount,
      invoiceNumber: payment.invoice.number,
    },
  });

  await notifyAfterPaymentComplete({
    userId: payment.invoice.userId,
    invoiceId: payment.invoiceId,
    paymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    invoiceNumber: payment.invoice.number,
    invoiceStatus: invoiceSnapshot?.status,
    invoiceTotal: invoiceSnapshot?.total ?? payment.invoice.total,
  });
}

async function failStripePayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, invoiceId: true, invoice: { select: { userId: true } } },
  });
  if (!payment || payment.status !== "PENDING") return;

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "FAILED" },
  });

  await writeAuditLog({
    userId: payment.invoice.userId,
    action: "payment.stripe_failed",
    invoiceId: payment.invoiceId,
    metadata: { paymentId },
  });
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return;

  const stripePaymentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  await completeStripePayment({
    paymentId,
    stripeSessionId: session.id,
    stripePaymentId,
  });
}

async function handleCheckoutSessionExpired(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return;
  await failStripePayment(paymentId);
}

export async function handleStripeWebhook(req: Request): Promise<{ received: true }> {
  assertStripeBillingEnabled();

  if (!config.stripe.webhookSecret) {
    throw new ApiError(503, "Stripe webhook secret is not configured", {
      code: "STRIPE_NOT_CONFIGURED",
    });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature || Array.isArray(signature)) {
    throw new ApiError(400, "Missing Stripe signature", {
      code: "STRIPE_SIGNATURE_MISSING",
    });
  }

  const stripe = getStripeClient();
  const rawBody = req.body as Buffer;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.stripe.webhookSecret,
    );
  } catch {
    throw new ApiError(400, "Invalid Stripe webhook signature", {
      code: "STRIPE_SIGNATURE_INVALID",
    });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "checkout.session.expired":
      await handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
      break;
    default:
      break;
  }

  return { received: true };
}

export function getStripeCheckoutMeta() {
  return {
    configured: isStripeConfigured(),
    billingEnabled: features.isBillingEnabled(),
    checkoutAvailable: features.isBillingEnabled() && isStripeConfigured(),
  };
}
