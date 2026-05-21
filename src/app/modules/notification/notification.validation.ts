import { z } from "zod";

import { cuidParamSchema } from "../../validation/common.schemas";

import { NOTIFICATION_TYPES } from "./notification.constants";

export const listNotificationsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1, "page must be at least 1").default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "limit must be at least 1")
      .max(100, "limit cannot exceed 100")
      .default(20),
    isRead: z
      .enum(["true", "false"], {
        message: "isRead must be true or false",
      })
      .optional()
      .transform((value) =>
        value === undefined ? undefined : value === "true",
      ),
    type: z
      .enum(NOTIFICATION_TYPES, {
        message: `type must be one of: ${NOTIFICATION_TYPES.join(", ")}`,
      })
      .optional(),
    sortBy: z
      .enum(["createdAt"], {
        message: "sortBy must be createdAt",
      })
      .default("createdAt"),
    sortOrder: z
      .enum(["asc", "desc"], { message: "sortOrder must be asc or desc" })
      .default("desc"),
  }),
});

export const notificationIdParamSchema = z.object({
  params: cuidParamSchema,
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>["query"];
