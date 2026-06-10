import type { SubscriptionPlan } from "@prisma/client";
import { config } from "../../config";
import { getPlanLimits } from "../../constants/plans";
import { isStripeConfigured } from "../../services/billing/stripe.client";
import { prisma } from "../../shared/prisma";
import { passwordRequirements } from "../auth/auth.validation";

import {
  buildMarketingFaqList,
  FAQ_CATEGORIES,
  FEATURE_CATEGORIES,
  FEATURE_COMPARISON_ROWS,
  FEATURES_FAQ,
  HOME_FAQ_ITEMS,
  MARKETING_FEATURES,
  PRICING_FAQ,
  PRICING_HIGHLIGHTS,
} from "./marketing.content";

const PLAN_MARKETING = [
  {
    id: "FREE" as const,
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Core invoicing for freelancers getting started",
    highlighted: false,
    cta: "Get started free",
  },
  {
    id: "PRO" as const,
    name: "Pro",
    price: "$19",
    period: "per month",
    description: "Growing businesses that invoice every week",
    highlighted: true,
    cta: "Start Pro trial",
  },
  {
    id: "ENTERPRISE" as const,
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    description: "Teams, volume billing & priority support",
    highlighted: false,
    cta: "Contact sales",
  },
];

async function fetchMarketingStats() {
  const [activeUsers, invoiceCount, paymentAgg] = await Promise.all([
    prisma.user.count({
      where: { deletedAt: null, isActive: true },
    }),
    prisma.invoice.count({
      where: { deletedAt: null },
    }),
    prisma.payment.aggregate({
      where: { status: "COMPLETED" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  return {
    activeUsers,
    invoicesCreated: invoiceCount,
    paymentsCompleted: paymentAgg._count._all,
    totalCollected: Math.round((paymentAgg._sum.amount ?? 0) * 100) / 100,
  };
}

function getMarketingProviders() {
  return {
    google: Boolean(config.googleClientId && config.googleClientSecret),
    github: Boolean(config.githubClientId && config.githubClientSecret),
    stripe: isStripeConfigured(),
  };
}

function buildMarketingPlans() {
  return PLAN_MARKETING.map((plan) => ({
    ...plan,
    limits: getPlanLimits(plan.id),
    features: buildPlanFeatures(plan.id),
  }));
}

function formatLimit(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return "Unlimited";
  return String(value);
}

function comparisonCell(
  plan: SubscriptionPlan,
  rowId: (typeof FEATURE_COMPARISON_ROWS)[number]["id"],
  stripeEnabled: boolean,
): string {
  const limits = getPlanLimits(plan);

  switch (rowId) {
    case "clients":
      return formatLimit(limits.maxClients);
    case "invoices":
      return formatLimit(limits.maxInvoicesPerMonth);
    case "recurring":
      return limits.maxRecurringSchedules === 0
        ? "—"
        : formatLimit(limits.maxRecurringSchedules);
    case "pdf":
      return limits.pdfExport ? "Yes" : "—";
    case "portal":
      return "Yes";
    case "stripe":
      return plan !== "FREE" && stripeEnabled ? "Yes" : plan !== "FREE" ? "Configure" : "—";
    case "branding":
      return limits.customBranding ? "Yes" : "—";
    case "support":
      return limits.prioritySupport ? "Yes" : "—";
    default:
      return "—";
  }
}

function buildComparisonMatrix(stripeEnabled: boolean) {
  const plans: SubscriptionPlan[] = ["FREE", "PRO", "ENTERPRISE"];
  return FEATURE_COMPARISON_ROWS.map((row) => ({
    id: row.id,
    label: row.label,
    values: Object.fromEntries(
      plans.map((plan) => [plan, comparisonCell(plan, row.id, stripeEnabled)]),
    ) as Record<SubscriptionPlan, string>,
  }));
}

export async function getMarketingHomeData() {
  const stats = await fetchMarketingStats();
  const plans = buildMarketingPlans();

  return {
    stats,
    plans,
    providers: getMarketingProviders(),
    passwordRequirements,
    testimonials: [
      {
        quote:
          "We replaced spreadsheets in a weekend. Clients pay from the portal and we finally see what's overdue.",
        author: "Sarah M.",
        role: "Freelance designer",
        rating: 5,
      },
      {
        quote:
          "Clean invoices, Stripe checkout, and reminders — exactly what our small agency needed.",
        author: "James K.",
        role: "Agency owner",
        rating: 5,
      },
    ],
    trustedLabels: ["Freelancers", "Agencies", "Consultants", "Studios", "SaaS founders"],
    faq: [...HOME_FAQ_ITEMS],
  };
}

export async function getMarketingPricingData() {
  const stats = await fetchMarketingStats();
  const providers = getMarketingProviders();
  const plans = buildMarketingPlans();

  return {
    stats,
    providers,
    plans,
    comparison: buildComparisonMatrix(providers.stripe),
    highlights: [...PRICING_HIGHLIGHTS],
    faq: [...PRICING_FAQ, ...HOME_FAQ_ITEMS.slice(0, 2)],
  };
}

export async function getMarketingFaqData() {
  const providers = getMarketingProviders();

  return {
    providers,
    categories: [...FAQ_CATEGORIES],
    faq: buildMarketingFaqList().map((item) => ({
      q: item.q,
      a: item.a,
      category: item.category,
    })),
  };
}

export async function getMarketingFeaturesData() {
  const stats = await fetchMarketingStats();
  const providers = getMarketingProviders();
  const plans = buildMarketingPlans();

  return {
    stats,
    providers,
    plans,
    categories: [...FEATURE_CATEGORIES],
    features: MARKETING_FEATURES.map((f) => ({
      ...f,
      plans: [...f.plans],
      highlights: f.highlights ? [...f.highlights] : [],
      available: f.plans.length > 0,
    })),
    comparison: buildComparisonMatrix(providers.stripe),
    integrations: [
      {
        id: "stripe",
        name: "Stripe",
        description: "Card checkout and payment webhooks",
        enabled: providers.stripe,
      },
      {
        id: "google",
        name: "Google",
        description: "Sign in with Google",
        enabled: providers.google,
      },
      {
        id: "github",
        name: "GitHub",
        description: "Sign in with GitHub",
        enabled: providers.github,
      },
    ],
    faq: [...FEATURES_FAQ],
  };
}

function buildPlanFeatures(plan: SubscriptionPlan): string[] {
  const limits = getPlanLimits(plan);
  const base = [
    `${formatLimit(limits.maxClients)} clients`,
    `${formatLimit(limits.maxInvoicesPerMonth)} invoices / month`,
    "PDF export",
    "Client portal",
  ];
  if (plan === "FREE") {
    return [...base, "Email support"];
  }
  if (plan === "PRO") {
    return [
      ...base,
      `${formatLimit(limits.maxRecurringSchedules)} recurring schedules`,
      "Custom branding",
      "Stripe payments",
    ];
  }
  return [
    ...base,
    "Unlimited recurring",
    "Custom branding",
    "Priority support",
    "Dedicated onboarding",
  ];
}
