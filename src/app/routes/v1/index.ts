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
import { adminRouter } from "../../modules/admin";
import { authRouter } from "../../modules/auth";
import { businessRouter } from "../../modules/business";
import { clientRouter } from "../../modules/client";
import { invoiceRouter } from "../../modules/invoice";
import { paymentRouter } from "../../modules/payment";
import { portalRouter } from "../../modules/portal";
import { recurringRouter } from "../../modules/recurring";
import { notificationRouter } from "../../modules/notification";
import { getUnreadNotificationCount } from "../../modules/notification/notification.service";
import { billingRouter } from "./billing.routes";
import { marketingRouter } from "../../modules/marketing";

/**
 * Versioned product API (`/api/v1/...`).
 *  - Public + mixed routes (e.g. `/auth/*`) mount directly on `v1Router`.
 *  - Authenticated product routes mount under `protectedV1`.
 */
const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/public/marketing", marketingRouter);
v1Router.use("/admin", adminRouter);
v1Router.use("/portal", portalRouter);

const protectedV1 = Router();
protectedV1.use(requireAuth, requireActiveUser, bootstrapUser, assertWorkspace);

protectedV1.get(
  "/me",
  loadSubscription,
  catchAsync(async (req, res) => {
    const userId = req.auth!.user.id;
    const plan = req.subscription?.plan ?? "FREE";
    const { unreadCount } = await getUnreadNotificationCount(userId);
    sendSuccess(res, {
      user: req.auth!.user,
      subscription: req.subscription ?? null,
      planLimits: getPlanLimits(plan),
      unreadNotificationCount: unreadCount,
    });
  }),
);

protectedV1.use("/business", businessRouter);
protectedV1.use("/clients", clientRouter);
protectedV1.use("/invoices", invoiceRouter);
protectedV1.use("/payments", paymentRouter);
protectedV1.use("/recurring-schedules", recurringRouter);
protectedV1.use("/notifications", notificationRouter);
protectedV1.use("/billing", billingRouter);

v1Router.use(protectedV1);

export { v1Router };
