import type Stripe from "stripe";

import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from "../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { config } from "../../config";
import { features } from "../../config/features";
import { prisma } from "../../shared/prisma";
import { writeAuditLog } from "../audit/auditLog.service";
import { notifySubscriptionCancelled } from "../notification";
import {
  getOfflineBillingPublicInfo,
  hasPendingOfflineUpgrade,
} from "./offlineUpgrade.service";

import { getStripeClient, isStripeConfigured } from "./stripe.client";

const UPGRADEABLE_PLANS = ["PRO", "ENTERPRISE"] as const;

export type UpgradeablePlan = (typeof UPGRADEABLE_PLANS)[number];

function assertStripeBillingEnabled(): void {
  if (!features.isBillingEnabled()) {
    throw new ApiError(503, "Billing is disabled", { code: "BILLING_DISABLED" });
  }
  if (!isStripeConfigured()) {
    throw new ApiError(503, "Stripe is not configured", {
      code: "STRIPE_NOT_CONFIGURED",
    });
  }
}

export function isProStripeCheckoutConfigured(): boolean {
  return Boolean(
    config.stripe.prices.proMonthly?.trim() || config.stripe.dynamicPro,
  );
}

export function getStripePriceId(plan: UpgradeablePlan): string {
  const priceId =
    plan === "PRO"
      ? config.stripe.prices.proMonthly
      : config.stripe.prices.enterpriseMonthly;

  if (!priceId?.trim()) {
    throw new ApiError(503, `Stripe price is not configured for ${plan}`, {
      code: "STRIPE_PRICE_NOT_CONFIGURED",
      details: { plan },
    });
  }

  return priceId.trim();
}

function buildCheckoutLineItems(plan: UpgradeablePlan) {
  const priceId =
    plan === "PRO"
      ? config.stripe.prices.proMonthly?.trim()
      : config.stripe.prices.enterpriseMonthly?.trim();

  if (priceId) {
    return [{ price: priceId, quantity: 1 }];
  }

  if (plan === "PRO" && config.stripe.dynamicPro) {
    const { amount, currency } = config.stripe.dynamicPro;
    return [
      {
        price_data: {
          currency,
          unit_amount: amount,
          recurring: { interval: "month" as const },
          product_data: {
            name: "Invoice Pro",
            metadata: { plan: "PRO" },
          },
        },
        quantity: 1,
      },
    ];
  }

  throw new ApiError(503, `Stripe price is not configured for ${plan}`, {
    code: "STRIPE_PRICE_NOT_CONFIGURED",
    details: { plan },
  });
}

export function planFromStripePriceId(priceId: string): SubscriptionPlan | null {
  if (priceId === config.stripe.prices.proMonthly) return "PRO";
  if (priceId === config.stripe.prices.enterpriseMonthly) return "ENTERPRISE";
  return null;
}

function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "canceled":
      return "CANCELLED";
    case "past_due":
      return "PAST_DUE";
    case "paused":
      return "PAUSED";
    default:
      return "ACTIVE";
  }
}

function getSubscriptionPeriodStart(subscription: Stripe.Subscription): Date | null {
  const start =
    subscription.items.data[0]?.current_period_start ??
    subscription.billing_cycle_anchor;
  return start ? new Date(start * 1000) : null;
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const end = subscription.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
}

export async function ensureStripeCustomer(userId: string): Promise<string> {
  assertStripeBillingEnabled();

  const row = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      stripeCustomerId: true,
      user: { select: { email: true, name: true } },
    },
  });

  if (!row) {
    throw new ApiError(404, "Subscription not found", {
      code: "SUBSCRIPTION_NOT_FOUND",
    });
  }

  if (row.stripeCustomerId) {
    return row.stripeCustomerId;
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: row.user.email,
    name: row.user.name,
    metadata: { userId },
  });

  await prisma.subscription.update({
    where: { userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function createPlanCheckoutSession(input: {
  userId: string;
  plan: UpgradeablePlan;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  assertStripeBillingEnabled();

  const current = await prisma.subscription.findUnique({
    where: { userId: input.userId },
    select: { plan: true, status: true, stripeSubscriptionId: true },
  });

  if (!current) {
    throw new ApiError(404, "Subscription not found", {
      code: "SUBSCRIPTION_NOT_FOUND",
    });
  }

  if (current.plan === input.plan && current.status === "ACTIVE") {
    throw new ApiError(409, "You are already on this plan", {
      code: "PLAN_ALREADY_ACTIVE",
      details: { plan: input.plan },
    });
  }

  const customerId = await ensureStripeCustomer(input.userId);
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: buildCheckoutLineItems(input.plan),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      userId: input.userId,
      plan: input.plan,
      type: "saas_subscription",
    },
    subscription_data: {
      metadata: {
        userId: input.userId,
        plan: input.plan,
      },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new ApiError(502, "Stripe did not return a checkout URL", {
      code: "STRIPE_CHECKOUT_FAILED",
    });
  }

  return { checkoutUrl: session.url, sessionId: session.id };
}

export async function createBillingPortalSession(input: {
  userId: string;
  returnUrl: string;
}): Promise<{ portalUrl: string }> {
  assertStripeBillingEnabled();

  const customerId = await ensureStripeCustomer(input.userId);
  const stripe = getStripeClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: input.returnUrl,
  });

  return { portalUrl: session.url };
}

export async function syncSubscriptionFromStripe(
  stripeSubscription: Stripe.Subscription,
): Promise<void> {
  const userId = stripeSubscription.metadata.userId;

  let subscriptionRow = userId
    ? await prisma.subscription.findUnique({ where: { userId } })
    : null;

  if (!subscriptionRow) {
    subscriptionRow = await prisma.subscription.findFirst({
      where: {
        OR: [
          { stripeSubscriptionId: stripeSubscription.id },
          {
            stripeCustomerId:
              typeof stripeSubscription.customer === "string"
                ? stripeSubscription.customer
                : stripeSubscription.customer.id,
          },
        ],
      },
    });
  }

  if (!subscriptionRow) {
    return;
  }

  const priceId = stripeSubscription.items.data[0]?.price.id;
  const mappedPlan =
    (priceId ? planFromStripePriceId(priceId) : null) ??
    (stripeSubscription.metadata?.plan === "PRO" ||
    stripeSubscription.metadata?.plan === "ENTERPRISE"
      ? (stripeSubscription.metadata.plan as SubscriptionPlan)
      : null);
  const previousPlan = subscriptionRow.plan;
  const previousStatus = subscriptionRow.status;
  const previousCancelAtPeriodEnd = subscriptionRow.cancelAtPeriodEnd;

  const data = {
    stripeSubscriptionId: stripeSubscription.id,
    stripeCustomerId:
      typeof stripeSubscription.customer === "string"
        ? stripeSubscription.customer
        : stripeSubscription.customer.id,
    status: mapStripeSubscriptionStatus(stripeSubscription.status),
    currentPeriodStart: getSubscriptionPeriodStart(stripeSubscription),
    currentPeriodEnd: getSubscriptionPeriodEnd(stripeSubscription),
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    trialEndsAt: stripeSubscription.trial_end
      ? new Date(stripeSubscription.trial_end * 1000)
      : null,
    ...(mappedPlan ? { plan: mappedPlan } : {}),
  };

  const updated = await prisma.subscription.update({
    where: { id: subscriptionRow.id },
    data,
  });

  await writeAuditLog({
    userId: subscriptionRow.userId,
    action: "billing.subscription_sync",
    metadata: {
      stripeSubscriptionId: stripeSubscription.id,
      plan: updated.plan,
      status: updated.status,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
    },
  });

  const becameCancelled =
    (updated.status === "CANCELLED" && previousStatus !== "CANCELLED") ||
    (updated.cancelAtPeriodEnd && !previousCancelAtPeriodEnd);

  if (becameCancelled) {
    await notifySubscriptionCancelled({
      userId: subscriptionRow.userId,
      plan: previousPlan,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      currentPeriodEnd: updated.currentPeriodEnd,
    });
  }
}

export async function handleSubscriptionCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "subscription") return;

  const userId = session.metadata?.userId;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!userId || !subscriptionId) return;

  const requestedPlan =
    session.metadata?.plan === "PRO" || session.metadata?.plan === "ENTERPRISE"
      ? (session.metadata.plan as SubscriptionPlan)
      : undefined;

  await prisma.subscription.update({
    where: { userId },
    data: {
      stripeSubscriptionId: subscriptionId,
      ...(requestedPlan ? { plan: requestedPlan, status: "ACTIVE" as const } : {}),
    },
  });

  const stripe = getStripeClient();
  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscriptionFromStripe(stripeSubscription);
}

export async function handleSubscriptionDeleted(
  stripeSubscription: Stripe.Subscription,
): Promise<void> {
  const row = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubscription.id },
  });

  if (!row) return;

  const previousPlan = row.plan;

  await prisma.subscription.update({
    where: { id: row.id },
    data: {
      plan: "FREE",
      status: "CANCELLED",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
    },
  });

  await writeAuditLog({
    userId: row.userId,
    action: "billing.subscription_deleted",
    metadata: {
      previousPlan,
      stripeSubscriptionId: stripeSubscription.id,
    },
  });

  await notifySubscriptionCancelled({
    userId: row.userId,
    plan: previousPlan,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  });
}

export function getSaasBillingMeta() {
  const offline = getOfflineBillingPublicInfo();
  const proStripeReady = isProStripeCheckoutConfigured();

  return {
    upgradeablePlans: UPGRADEABLE_PLANS,
    pricesConfigured: {
      PRO: proStripeReady,
      ENTERPRISE: Boolean(config.stripe.prices.enterpriseMonthly?.trim()),
    },
    subscriptionCheckoutAvailable:
      features.isBillingEnabled() &&
      isStripeConfigured() &&
      (proStripeReady || Boolean(config.stripe.prices.enterpriseMonthly?.trim())),
    portalAvailable:
      features.isBillingEnabled() && isStripeConfigured(),
    offlineUpgrade: offline,
  };
}

export async function getSaasBillingMetaForUser(userId: string) {
  const meta = getSaasBillingMeta();
  const pendingOfflineUpgrade = meta.offlineUpgrade.enabled
    ? await hasPendingOfflineUpgrade(userId)
    : false;

  return {
    ...meta,
    pendingOfflineUpgrade,
  };
}
