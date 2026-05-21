import { z } from "zod";

import { PAYMENT_POLICY } from "../payment/payment.constants";

const portalTokenSchema = z
  .string()
  .trim()
  .min(32, "Invalid portal token")
  .max(128, "Invalid portal token")
  .regex(/^[a-f0-9]+$/i, "Invalid portal token");

export const portalTokenParamSchema = z.object({
  params: z.object({
    token: portalTokenSchema,
  }),
});

export const portalInvoiceParamSchema = z.object({
  params: z.object({
    token: portalTokenSchema,
    invoiceId: z.string().cuid("Invalid invoice id"),
  }),
});

export const listPortalInvoicesQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: z
      .enum([
        "SENT",
        "VIEWED",
        "PARTIALLY_PAID",
        "PAID",
        "OVERDUE",
        "REFUNDED",
      ])
      .optional(),
    sortBy: z
      .enum(["issueDate", "dueDate", "createdAt", "total"])
      .default("issueDate"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),
});

export type ListPortalInvoicesQuery = z.infer<
  typeof listPortalInvoicesQuerySchema
>["query"];

export const portalCheckoutSchema = z.object({
  params: portalInvoiceParamSchema.shape.params,
  body: z
    .object({
      amount: z
        .number()
        .min(PAYMENT_POLICY.amount.min, "Amount must be greater than zero")
        .max(PAYMENT_POLICY.amount.max, "Amount is too large")
        .optional(),
    })
    .optional()
    .default({}),
});

export type PortalCheckoutInput = z.infer<typeof portalCheckoutSchema>["body"];
