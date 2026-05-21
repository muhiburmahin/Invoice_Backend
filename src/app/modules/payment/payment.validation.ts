import { z } from "zod";

import { cuidParamSchema } from "../../validation/common.schemas";
import { CURRENCY_CODES } from "../business/business.constants";

import {
  PAYMENT_METHODS,
  PAYMENT_POLICY,
  PAYMENT_STATUSES,
} from "./payment.constants";

const paymentNoteSchema = z
  .string()
  .trim()
  .max(PAYMENT_POLICY.note.max, "Note is too long")
  .optional()
  .or(z.literal(""))
  .or(z.null());

export const createPaymentSchema = z.object({
  body: z.object({
    invoiceId: z
      .string({ message: "Invoice is required" })
      .cuid("Please select a valid invoice"),
    amount: z
      .number({ message: "Amount is required" })
      .min(PAYMENT_POLICY.amount.min, "Amount must be greater than zero")
      .max(PAYMENT_POLICY.amount.max, "Amount is too large"),
    method: z.enum(PAYMENT_METHODS, {
      message: `Method must be one of: ${PAYMENT_METHODS.join(", ")}`,
    }),
    currency: z
      .enum(CURRENCY_CODES, {
        message: `Currency must be one of: ${CURRENCY_CODES.join(", ")}`,
      })
      .optional(),
    note: paymentNoteSchema,
    paidAt: z
      .union([z.string().datetime(), z.date()])
      .optional()
      .transform((v) => (v ? new Date(v) : undefined))
      .refine(
        (v) => !v || v.getTime() <= Date.now(),
        "Paid date cannot be in the future",
      ),
  }),
});

export const updatePaymentStatusSchema = z.object({
  params: cuidParamSchema,
  body: z.object({
    status: z.enum(PAYMENT_STATUSES, {
      message: `Status must be one of: ${PAYMENT_STATUSES.join(", ")}`,
    }),
    note: paymentNoteSchema,
  }),
});

export const paymentIdParamSchema = z.object({
  params: cuidParamSchema,
});

export const listPaymentsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    invoiceId: z.string().cuid().optional(),
    status: z.enum(PAYMENT_STATUSES).optional(),
    method: z.enum(PAYMENT_METHODS).optional(),
    fromDate: z
      .union([z.string().datetime(), z.coerce.date()])
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
    toDate: z
      .union([z.string().datetime(), z.coerce.date()])
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
    sortBy: z
      .enum(["createdAt", "paidAt", "amount"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>["body"];
export type UpdatePaymentStatusInput = z.infer<
  typeof updatePaymentStatusSchema
>["body"];
export type ListPaymentsQuery = z.infer<
  typeof listPaymentsQuerySchema
>["query"];
