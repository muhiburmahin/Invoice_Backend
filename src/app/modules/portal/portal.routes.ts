import { Router } from "express";
import rateLimit from "express-rate-limit";

import { validateRequest } from "../../middlewares";

import {
  createPortalCheckoutHandler,
  getPortalInvoiceHandler,
  getPortalInvoicePdfHandler,
  listPortalInvoicesHandler,
  portalMetaHandler,
} from "./portal.controller";
import {
  listPortalInvoicesQuerySchema,
  portalCheckoutSchema,
  portalInvoiceParamSchema,
  portalTokenParamSchema,
} from "./portal.validation";

const portalRouter = Router();

const portalLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again in a few minutes.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

portalRouter.use(portalLimit);

portalRouter.get(
  "/:token/meta",
  validateRequest({ params: portalTokenParamSchema.shape.params }),
  portalMetaHandler,
);

portalRouter.get(
  "/:token/invoices",
  validateRequest({
    params: portalTokenParamSchema.shape.params,
    query: listPortalInvoicesQuerySchema.shape.query,
  }),
  listPortalInvoicesHandler,
);

portalRouter.get(
  "/:token/invoices/:invoiceId/pdf",
  validateRequest({ params: portalInvoiceParamSchema.shape.params }),
  getPortalInvoicePdfHandler,
);

portalRouter.post(
  "/:token/invoices/:invoiceId/checkout",
  portalLimit,
  validateRequest({
    params: portalCheckoutSchema.shape.params,
    body: portalCheckoutSchema.shape.body,
  }),
  createPortalCheckoutHandler,
);

portalRouter.get(
  "/:token/invoices/:invoiceId",
  validateRequest({ params: portalInvoiceParamSchema.shape.params }),
  getPortalInvoiceHandler,
);

export { portalRouter };
