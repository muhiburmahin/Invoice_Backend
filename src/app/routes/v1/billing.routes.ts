import { Router } from "express";
import type { Request, Response } from "express";

import { config } from "../../config";
import { features } from "../../config/features";
import { ApiError } from "../../errors/ApiError";
import { loadSubscription } from "../../middlewares";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";
import { getUsageSnapshot } from "../../services/billing/planUsage.service";
import { isStripeConfigured } from "../../services/billing/stripe.client";

export const billingRouter = Router();

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

/**
 * Stripe webhook — mount with `express.raw` in `app.ts` (before `express.json`).
 * Implement signature verification + event handlers when billing goes live.
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!features.isBillingEnabled()) {
    throw new ApiError(503, "Billing is disabled", { code: "BILLING_DISABLED" });
  }

  if (!isStripeConfigured() || !config.stripe.webhookSecret) {
    throw new ApiError(503, "Stripe is not configured", { code: "STRIPE_NOT_CONFIGURED" });
  }

  // TODO: const stripe = getStripeClient(); stripe.webhooks.constructEvent(...)
  sendSuccess(res, { received: true });
}
