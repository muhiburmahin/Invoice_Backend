import { Router } from "express";
import type { Request, Response } from "express";

import { loadSubscription } from "../../middlewares";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";
import { getUsageSnapshot } from "../../services/billing/planUsage.service";
import { handleStripeWebhook } from "../../services/billing/stripeCheckout.service";

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

/** Stripe webhook — mounted with `express.raw` in `app.ts` (before `express.json`). */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const result = await handleStripeWebhook(req);
  sendSuccess(res, result);
}
