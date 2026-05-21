import { z } from "zod";

import { cuidParamSchema } from "../../validation/common.schemas";

import { RECURRING_FREQUENCIES } from "./recurring.constants";

const nextRunAtSchema = z
  .union([z.string().datetime(), z.coerce.date()])
  .transform((v) => new Date(v));

export const createRecurringSchema = z.object({
  body: z.object({
    clientId: z
      .string({ message: "Client is required" })
      .cuid("Please select a valid client"),
    frequency: z.enum(RECURRING_FREQUENCIES, {
      message: `Frequency must be one of: ${RECURRING_FREQUENCIES.join(", ")}`,
    }),
    nextRunAt: nextRunAtSchema.optional(),
    isActive: z.boolean().optional().default(true),
  }),
});

export const updateRecurringSchema = z.object({
  params: cuidParamSchema,
  body: z
    .object({
      frequency: z.enum(RECURRING_FREQUENCIES).optional(),
      nextRunAt: nextRunAtSchema.optional(),
    })
    .refine(
      (body) => body.frequency !== undefined || body.nextRunAt !== undefined,
      "Provide at least one field to update",
    ),
});

export const updateRecurringStatusSchema = z.object({
  params: cuidParamSchema,
  body: z.object({
    isActive: z.boolean({ message: "isActive is required" }),
  }),
});

export const recurringIdParamSchema = z.object({
  params: cuidParamSchema,
});

export const listRecurringQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    clientId: z.string().cuid().optional(),
    frequency: z.enum(RECURRING_FREQUENCIES).optional(),
    isActive: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    overdue: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    sortBy: z
      .enum(["createdAt", "nextRunAt", "updatedAt"])
      .default("nextRunAt"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  }),
});

export type CreateRecurringInput = z.infer<
  typeof createRecurringSchema
>["body"];
export type UpdateRecurringInput = z.infer<
  typeof updateRecurringSchema
>["body"];
export type UpdateRecurringStatusInput = z.infer<
  typeof updateRecurringStatusSchema
>["body"];
export type ListRecurringQuery = z.infer<
  typeof listRecurringQuerySchema
>["query"];

const runDateSchema = z
  .union([z.string().datetime(), z.coerce.date()])
  .transform((v) => new Date(v));

export const runRecurringSchema = z.object({
  params: cuidParamSchema,
  body: z
    .object({
      issueDate: runDateSchema.optional(),
      dueDate: runDateSchema.optional(),
    })
    .default({})
    .superRefine((data, ctx) => {
      if (
        data.issueDate &&
        data.dueDate &&
        data.dueDate.getTime() < data.issueDate.getTime()
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Due date cannot be before the issue date",
          path: ["dueDate"],
        });
      }
    }),
});

export type RunRecurringInput = z.infer<typeof runRecurringSchema>["body"];
