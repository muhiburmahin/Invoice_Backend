import { Router } from "express";
import rateLimit from "express-rate-limit";

import { validateRequest } from "../../middlewares";

import {
  deleteNotificationHandler,
  deleteReadNotificationsHandler,
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
  unreadCountHandler,
} from "./notification.controller";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from "./notification.validation";

const notificationRouter = Router();

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

notificationRouter.get(
  "/unread-count",
  unreadCountHandler,
);

notificationRouter.get(
  "/",
  validateRequest({ query: listNotificationsQuerySchema.shape.query }),
  listNotificationsHandler,
);

notificationRouter.patch(
  "/read-all",
  moderate,
  markAllNotificationsReadHandler,
);

notificationRouter.delete(
  "/read",
  moderate,
  deleteReadNotificationsHandler,
);

notificationRouter.patch(
  "/:id/read",
  moderate,
  validateRequest({ params: notificationIdParamSchema.shape.params }),
  markNotificationReadHandler,
);

notificationRouter.delete(
  "/:id",
  moderate,
  validateRequest({ params: notificationIdParamSchema.shape.params }),
  deleteNotificationHandler,
);

export { notificationRouter };
