import { Router } from "express";
import rateLimit from "express-rate-limit";

import { loadSubscription, validateRequest } from "../../middlewares";
import { listInvoicePaymentsHandler } from "../payment/payment.controller";

import {
  createInvoiceHandler,
  deleteInvoiceHandler,
  duplicateInvoiceHandler,
  getInvoiceHandler,
  getInvoicePdfHandler,
  invoiceMetaHandler,
  invoiceStatsHandler,
  listInvoicesHandler,
  remindInvoiceHandler,
  sendInvoiceHandler,
  updateInvoiceHandler,
  updateInvoiceStatusHandler,
} from "./invoice.controller";
import {
  createInvoiceSchema,
  invoiceIdParamSchema,
  listInvoicesQuerySchema,
  remindInvoiceSchema,
  sendInvoiceSchema,
  updateInvoiceSchema,
  updateInvoiceStatusSchema,
} from "./invoice.validation";

const invoiceRouter = Router();

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

invoiceRouter.get("/meta", invoiceMetaHandler);

invoiceRouter.get(
  "/stats",
  loadSubscription,
  invoiceStatsHandler,
);

invoiceRouter.get(
  "/",
  validateRequest({ query: listInvoicesQuerySchema.shape.query }),
  listInvoicesHandler,
);

invoiceRouter.get(
  "/:id/payments",
  validateRequest({ params: invoiceIdParamSchema.shape.params }),
  listInvoicePaymentsHandler,
);

invoiceRouter.get(
  "/:id/pdf",
  loadSubscription,
  validateRequest({ params: invoiceIdParamSchema.shape.params }),
  getInvoicePdfHandler,
);

invoiceRouter.get(
  "/:id",
  validateRequest({ params: invoiceIdParamSchema.shape.params }),
  getInvoiceHandler,
);

/* ------------------------------ Write ------------------------------------ */

invoiceRouter.post(
  "/",
  moderate,
  loadSubscription,
  validateRequest({ body: createInvoiceSchema.shape.body }),
  createInvoiceHandler,
);

invoiceRouter.post(
  "/:id/duplicate",
  moderate,
  loadSubscription,
  validateRequest({ params: invoiceIdParamSchema.shape.params }),
  duplicateInvoiceHandler,
);

invoiceRouter.post(
  "/:id/send",
  moderate,
  loadSubscription,
  validateRequest({
    params: sendInvoiceSchema.shape.params,
    body: sendInvoiceSchema.shape.body,
  }),
  sendInvoiceHandler,
);

invoiceRouter.post(
  "/:id/remind",
  moderate,
  loadSubscription,
  validateRequest({
    params: remindInvoiceSchema.shape.params,
    body: remindInvoiceSchema.shape.body,
  }),
  remindInvoiceHandler,
);

invoiceRouter.patch(
  "/:id",
  moderate,
  validateRequest({
    params: updateInvoiceSchema.shape.params,
    body: updateInvoiceSchema.shape.body,
  }),
  updateInvoiceHandler,
);

invoiceRouter.patch(
  "/:id/status",
  moderate,
  validateRequest({
    params: updateInvoiceStatusSchema.shape.params,
    body: updateInvoiceStatusSchema.shape.body,
  }),
  updateInvoiceStatusHandler,
);

invoiceRouter.delete(
  "/:id",
  moderate,
  validateRequest({ params: invoiceIdParamSchema.shape.params }),
  deleteInvoiceHandler,
);

export { invoiceRouter };
