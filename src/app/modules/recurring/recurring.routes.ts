import { Router } from "express";
import rateLimit from "express-rate-limit";

import { loadSubscription, validateRequest } from "../../middlewares";

import {
  createRecurringHandler,
  deleteRecurringHandler,
  getRecurringHandler,
  listRecurringHandler,
  listScheduleInvoicesHandler,
  recurringMetaHandler,
  recurringStatsHandler,
  runRecurringHandler,
  updateRecurringHandler,
  updateRecurringStatusHandler,
} from "./recurring.controller";
import {
  createRecurringSchema,
  listRecurringQuerySchema,
  recurringIdParamSchema,
  runRecurringSchema,
  updateRecurringSchema,
  updateRecurringStatusSchema,
} from "./recurring.validation";

const recurringRouter = Router();

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

recurringRouter.get("/meta", recurringMetaHandler);

recurringRouter.get(
  "/stats",
  loadSubscription,
  recurringStatsHandler,
);

recurringRouter.get(
  "/",
  validateRequest({ query: listRecurringQuerySchema.shape.query }),
  listRecurringHandler,
);

recurringRouter.get(
  "/:id/invoices",
  validateRequest({ params: recurringIdParamSchema.shape.params }),
  listScheduleInvoicesHandler,
);

recurringRouter.post(
  "/:id/run",
  moderate,
  loadSubscription,
  validateRequest({
    params: runRecurringSchema.shape.params,
    body: runRecurringSchema.shape.body,
  }),
  runRecurringHandler,
);

recurringRouter.get(
  "/:id",
  validateRequest({ params: recurringIdParamSchema.shape.params }),
  getRecurringHandler,
);

/* ------------------------------ Write ------------------------------------ */

recurringRouter.post(
  "/",
  moderate,
  loadSubscription,
  validateRequest({ body: createRecurringSchema.shape.body }),
  createRecurringHandler,
);

recurringRouter.patch(
  "/:id",
  moderate,
  validateRequest({
    params: updateRecurringSchema.shape.params,
    body: updateRecurringSchema.shape.body,
  }),
  updateRecurringHandler,
);

recurringRouter.patch(
  "/:id/status",
  moderate,
  loadSubscription,
  validateRequest({
    params: updateRecurringStatusSchema.shape.params,
    body: updateRecurringStatusSchema.shape.body,
  }),
  updateRecurringStatusHandler,
);

recurringRouter.delete(
  "/:id",
  moderate,
  validateRequest({ params: recurringIdParamSchema.shape.params }),
  deleteRecurringHandler,
);

export { recurringRouter };
