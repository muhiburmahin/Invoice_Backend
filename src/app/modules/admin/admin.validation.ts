import { z } from "zod";

const userIdParam = z.object({
  id: z.string({ message: "User id is required" }).min(1, "User id is required"),
});

export const userIdParamSchema = z.object({
  params: userIdParam,
});

export const listUsersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1, "page must be at least 1").default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "limit must be at least 1")
      .max(100, "limit cannot exceed 100")
      .default(20),
    search: z
      .string()
      .trim()
      .max(120, "search keyword is too long")
      .optional(),
    role: z
      .enum(["USER", "SUPPORT", "SUPER_ADMIN"], {
        message: "role must be USER, SUPPORT or SUPER_ADMIN",
      })
      .optional(),
    plan: z
      .enum(["FREE", "PRO", "ENTERPRISE"], {
        message: "plan must be FREE, PRO or ENTERPRISE",
      })
      .optional(),
    status: z
      .enum(["active", "inactive", "deleted"], {
        message: "status must be active, inactive or deleted",
      })
      .optional(),
    isVerified: z
      .union([z.literal("true"), z.literal("false")])
      .transform((v) => v === "true")
      .optional(),
    sortBy: z
      .enum(["createdAt", "lastLoginAt", "email", "name"], {
        message:
          "sortBy must be one of: createdAt, lastLoginAt, email, name",
      })
      .default("createdAt"),
    sortOrder: z
      .enum(["asc", "desc"], { message: "sortOrder must be asc or desc" })
      .default("desc"),
  }),
});

export const updateUserStatusSchema = z.object({
  params: userIdParam,
  body: z.object({
    isActive: z.boolean({ message: "isActive must be true or false" }),
    reason: z
      .string()
      .trim()
      .max(500, "reason cannot exceed 500 characters")
      .optional(),
  }),
});

export const updateUserRoleSchema = z.object({
  params: userIdParam,
  body: z.object({
    role: z.enum(["USER", "SUPPORT", "SUPER_ADMIN"], {
      message: "role must be USER, SUPPORT or SUPER_ADMIN",
    }),
  }),
});

export const updateUserPlanSchema = z.object({
  params: userIdParam,
  body: z.object({
    plan: z.enum(["FREE", "PRO", "ENTERPRISE"], {
      message: "plan must be FREE, PRO or ENTERPRISE",
    }),
    status: z
      .enum(["ACTIVE", "TRIALING", "CANCELLED", "PAST_DUE", "PAUSED"], {
        message:
          "status must be ACTIVE, TRIALING, CANCELLED, PAST_DUE or PAUSED",
      })
      .optional(),
    currentPeriodEnd: z
      .union([z.string().datetime(), z.date()])
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
    cancelAtPeriodEnd: z.boolean().optional(),
    reason: z
      .string()
      .trim()
      .max(500, "reason cannot exceed 500 characters")
      .optional(),
  }),
});

export const activityLogsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    userId: z.string().optional(),
    action: z.string().trim().max(80).optional(),
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>["query"];
export type UpdateUserStatusInput = z.infer<
  typeof updateUserStatusSchema
>["body"];
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>["body"];
export type UpdateUserPlanInput = z.infer<typeof updateUserPlanSchema>["body"];
export type ActivityLogsQuery = z.infer<
  typeof activityLogsQuerySchema
>["query"];
