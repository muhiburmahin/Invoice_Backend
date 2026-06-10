import { Router } from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";

import { config } from "../../config";
import { loadSubscription, validateRequest } from "../../middlewares";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";
import { getUsageSnapshot } from "../../services/billing/planUsage.service";
import { handleStripeWebhook, getStripeCheckoutMeta } from "../../services/billing/stripeCheckout.service";
import {
  getOfflineBillingPublicInfo,
  submitOfflineUpgradeRequest,
} from "../../services/billing/offlineUpgrade.service";
import {
  createBillingPortalSession,
  createPlanCheckoutSession,
  getSaasBillingMetaForUser,
} from "../../services/billing/stripeSubscription.service";

import {
  createBillingPortalSchema,
  createPlanCheckoutSchema,
  offlineUpgradeRequestSchema,
} from "./billing.validation";

export const billingRouter = Router();

const moderate = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many billing requests. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

billingRouter.get(
  "/meta",
  loadSubscription,
  catchAsync(async (req, res) => {
    const userId = req.auth!.user.id;
    sendSuccess(res, {
      invoicePayments: getStripeCheckoutMeta(),
      saas: await getSaasBillingMetaForUser(userId),
    });
  }),
);

billingRouter.get(
  "/offline-info",
  catchAsync(async (_req, res) => {
    sendSuccess(res, { offline: getOfflineBillingPublicInfo() });
  }),
);

billingRouter.post(
  "/offline-request",
  moderate,
  loadSubscription,
  validateRequest({ body: offlineUpgradeRequestSchema.shape.body }),
  catchAsync(async (req, res) => {
    const userId = req.auth!.user.id;
    const body = req.body as {
      plan: "PRO";
      paymentReference?: string;
      note?: string;
    };

    const result = await submitOfflineUpgradeRequest(req, userId, {
      plan: body.plan,
      paymentReference: body.paymentReference,
      note: body.note,
    });

    sendSuccess(res, result);
  }),
);

billingRouter.get(
  "/subscription",
  loadSubscription,
  catchAsync(async (req, res) => {
    sendSuccess(res, {
      subscription: req.subscription ?? null,
    });
  }),
);

billingRouter.get(
  "/usage",
  catchAsync(async (req, res) => {
    const usage = await getUsageSnapshot(req.auth!.user.id);
    sendSuccess(res, { usage });
  }),
);

billingRouter.post(
  "/checkout",
  moderate,
  loadSubscription,
  validateRequest({ body: createPlanCheckoutSchema.shape.body }),
  catchAsync(async (req, res) => {
    const userId = req.auth!.user.id;
    const base = config.clientUrl.replace(/\/$/, "");
    const body = req.body as {
      plan: "PRO" | "ENTERPRISE";
      successUrl?: string;
      cancelUrl?: string;
    };

    const result = await createPlanCheckoutSession({
      userId,
      plan: body.plan,
      successUrl: body.successUrl ?? `${base}/billing?checkout=success`,
      cancelUrl: body.cancelUrl ?? `${base}/billing?checkout=cancelled`,
    });

    sendSuccess(res, {
      ...result,
      message: "Stripe checkout session created",
    });
  }),
);

billingRouter.post(
  "/portal",
  moderate,
  loadSubscription,
  validateRequest({ body: createBillingPortalSchema.shape.body }),
  catchAsync(async (req, res) => {
    const userId = req.auth!.user.id;
    const base = config.clientUrl.replace(/\/$/, "");
    const body = req.body as { returnUrl?: string };

    const result = await createBillingPortalSession({
      userId,
      returnUrl: body.returnUrl ?? `${base}/billing`,
    });

    sendSuccess(res, {
      ...result,
      message: "Stripe billing portal session created",
    });
  }),
);

/** Stripe webhook — mounted with `express.raw` in `app.ts` (before `express.json`). */
export async function stripeWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await handleStripeWebhook(req);
  sendSuccess(res, result);
}
