import { Router } from "express";
import rateLimit from "express-rate-limit";

import { loadSubscription, validateRequest } from "../../middlewares";

import {
  clientStatsHandler,
  createClientHandler,
  deleteClientHandler,
  getClientHandler,
  listClientsHandler,
  regeneratePortalTokenHandler,
  restoreClientHandler,
  updateClientHandler,
  updateClientStatusHandler,
} from "./client.controller";
import {
  clientIdParamSchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
  updateClientStatusSchema,
} from "./client.validation";

const clientRouter = Router();

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

clientRouter.get(
  "/stats",
  loadSubscription,
  clientStatsHandler,
);

clientRouter.get(
  "/",
  validateRequest({ query: listClientsQuerySchema.shape.query }),
  listClientsHandler,
);

clientRouter.get(
  "/:id",
  validateRequest({ params: clientIdParamSchema.shape.params }),
  getClientHandler,
);

/* ------------------------------ Write ------------------------------------ */

clientRouter.post(
  "/",
  moderate,
  loadSubscription,
  validateRequest({ body: createClientSchema.shape.body }),
  createClientHandler,
);

clientRouter.patch(
  "/:id",
  moderate,
  validateRequest({
    params: updateClientSchema.shape.params,
    body: updateClientSchema.shape.body,
  }),
  updateClientHandler,
);

clientRouter.patch(
  "/:id/status",
  moderate,
  validateRequest({
    params: updateClientStatusSchema.shape.params,
    body: updateClientStatusSchema.shape.body,
  }),
  updateClientStatusHandler,
);

clientRouter.patch(
  "/:id/restore",
  moderate,
  loadSubscription,
  validateRequest({ params: clientIdParamSchema.shape.params }),
  restoreClientHandler,
);

clientRouter.post(
  "/:id/portal-token/regenerate",
  moderate,
  validateRequest({ params: clientIdParamSchema.shape.params }),
  regeneratePortalTokenHandler,
);

clientRouter.delete(
  "/:id",
  moderate,
  validateRequest({ params: clientIdParamSchema.shape.params }),
  deleteClientHandler,
);

export { clientRouter };
