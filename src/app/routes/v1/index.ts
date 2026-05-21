import { Router } from "express";

import {
  assertWorkspace,
  bootstrapUser,
  loadSubscription,
  requireActiveUser,
  requireAuth,
} from "../../middlewares";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";
import { getPlanLimits } from "../../constants/plans";
import { billingRouter } from "./billing.routes";

/**
 * Versioned product API (`/api/v1/...`). Add module routers under `protectedV1`.
 */
const v1Router = Router();

const protectedV1 = Router();
protectedV1.use(requireAuth, requireActiveUser, bootstrapUser, assertWorkspace);

protectedV1.get(
  "/me",
  loadSubscription,
  catchAsync(async (req, res) => {
    const plan = req.subscription?.plan ?? "FREE";
    sendSuccess(res, {
      user: req.auth!.user,
      subscription: req.subscription ?? null,
      planLimits: getPlanLimits(plan),
    });
  }),
);

protectedV1.use("/billing", billingRouter);

v1Router.use(protectedV1);

export { v1Router };
