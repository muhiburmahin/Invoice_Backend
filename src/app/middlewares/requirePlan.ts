import type { RequestHandler } from "express";

import type { SubscriptionPlan } from "@prisma/client";
import { ApiError } from "../errors/ApiError";
import { catchAsync } from "../shared/catchAsync";

/** Requires an active subscription on one of the given plans. Use after {@link loadSubscription}. */
export function requirePlan(...allowed: SubscriptionPlan[]): RequestHandler {
  return catchAsync(async (req, _res, next) => {
    const subscription = req.subscription;
    const plan = subscription?.plan ?? "FREE";
    const status = subscription?.status ?? "ACTIVE";

    if (!allowed.includes(plan)) {
      throw new ApiError(403, "This feature requires a higher plan", {
        code: "PLAN_UPGRADE_REQUIRED",
        details: { currentPlan: plan, requiredPlans: allowed },
      });
    }

    if (status === "CANCELLED" || status === "PAST_DUE") {
      throw new ApiError(403, "Subscription is not active", {
        code: "SUBSCRIPTION_INACTIVE",
        details: { status },
      });
    }

    next();
  });
}
