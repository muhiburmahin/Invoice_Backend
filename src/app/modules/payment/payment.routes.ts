import { Router } from "express";
import rateLimit from "express-rate-limit";

import { validateRequest } from "../../middlewares";

import {
  cancelPaymentHandler,
  createStripeCheckoutHandler,
  getPaymentHandler,
  listPaymentsHandler,
  paymentMetaHandler,
  paymentStatsHandler,
  recordPaymentHandler,
  updatePaymentStatusHandler,
} from "./payment.controller";
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
  paymentIdParamSchema,
  stripeCheckoutSchema,
  updatePaymentStatusSchema,
} from "./payment.validation";

const paymentRouter = Router();

const moderate = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again in a few minutes.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

/* ------------------------------- Read ------------------------------------ */

paymentRouter.get("/meta", paymentMetaHandler);
paymentRouter.get("/stats", paymentStatsHandler);

paymentRouter.get(
  "/",
  validateRequest({ query: listPaymentsQuerySchema.shape.query }),
  listPaymentsHandler,
);

paymentRouter.get(
  "/:id",
  validateRequest({ params: paymentIdParamSchema.shape.params }),
  getPaymentHandler,
);

/* ------------------------------ Write ------------------------------------ */

paymentRouter.post(
  "/stripe/checkout",
  moderate,
  validateRequest({ body: stripeCheckoutSchema.shape.body }),
  createStripeCheckoutHandler,
);

paymentRouter.post(
  "/",
  moderate,
  validateRequest({ body: createPaymentSchema.shape.body }),
  recordPaymentHandler,
);

paymentRouter.patch(
  "/:id/status",
  moderate,
  validateRequest({
    params: updatePaymentStatusSchema.shape.params,
    body: updatePaymentStatusSchema.shape.body,
  }),
  updatePaymentStatusHandler,
);

paymentRouter.delete(
  "/:id",
  moderate,
  validateRequest({ params: paymentIdParamSchema.shape.params }),
  cancelPaymentHandler,
);

export { paymentRouter };
