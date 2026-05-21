import { Router } from "express";
import rateLimit from "express-rate-limit";

import { validateRequest } from "../../middlewares";

import {
  branding,
  currenciesHandler,
  getBusinessHandler,
  updateBusinessHandler,
} from "./business.controller";
import { updateBusinessSchema } from "./business.validation";

const businessRouter = Router();

/**
 * Update bursts (logo upload + branding tweaks) often happen in quick
 * succession from settings UI, so moderate rate-limit instead of strict.
 */
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

businessRouter.get("/", getBusinessHandler);
businessRouter.get("/preview", branding);
businessRouter.get("/currencies", currenciesHandler);

/* ------------------------------ Write ------------------------------------ */

businessRouter.patch(
  "/",
  moderate,
  validateRequest({ body: updateBusinessSchema.shape.body }),
  updateBusinessHandler,
);

export { businessRouter };
