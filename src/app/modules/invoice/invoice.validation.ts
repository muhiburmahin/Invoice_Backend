import { z } from "zod";

import { cuidParamSchema } from "../../validation/common.schemas";
import { CURRENCY_CODES } from "../business/business.constants";

import { INVOICE_EMAIL_POLICY, INVOICE_POLICY, INVOICE_STATUSES } from "./invoice.constants";

/* -------------------------------------------------------------------------- */
/*                              Reusable atoms                                */
/* -------------------------------------------------------------------------- */

const invoiceItemSchema = z.object({
  description: z
    .string({ message: "Item description is required" })
    .trim()
    .min(1, "Item description is required")
    .max(
      INVOICE_POLICY.itemDescription.max,
      `Description cannot exceed ${INVOICE_POLICY.itemDescription.max} characters`,
    ),
  quantity: z
    .number({ message: "Quantity must be a number" })
    .min(INVOICE_POLICY.quantity.min, "Quantity must be greater than 0")
    .max(INVOICE_POLICY.quantity.max, "Quantity is too large"),
  rate: z
    .number({ message: "Rate must be a number" })
    .min(INVOICE_POLICY.rate.min, "Rate cannot be negative")
    .max(INVOICE_POLICY.rate.max, "Rate is too large"),
  unit: z
    .string()
    .trim()
    .max(INVOICE_POLICY.itemUnit.max, "Unit is too long")
    .optional()
    .or(z.literal("")),
  taxable: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} cannot exceed ${max} characters`)
    .optional()
    .or(z.literal(""))
    .or(z.null());

const invoiceCoreSchema = z.object({
  clientId: z
    .string({ message: "Client is required" })
    .cuid("Please select a valid client"),
  issueDate: z
    .union([z.string().datetime(), z.date()])
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  dueDate: z
    .union([z.string().datetime(), z.date()])
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  taxRate: z
    .number({ message: "Tax rate must be a number" })
    .min(INVOICE_POLICY.taxRate.min, "Tax rate cannot be negative")
    .max(INVOICE_POLICY.taxRate.max, "Tax rate cannot exceed 100%")
    .optional(),
  discount: z
    .number({ message: "Discount must be a number" })
    .min(INVOICE_POLICY.discount.min, "Discount cannot be negative")
    .max(INVOICE_POLICY.discount.max, "Discount is too large")
    .optional(),
  discountType: z
    .enum(["FIXED", "PERCENTAGE"], {
      message: "Discount type must be FIXED or PERCENTAGE",
    })
    .optional(),
  currency: z
    .enum(CURRENCY_CODES, {
      message: `Currency must be one of: ${CURRENCY_CODES.join(", ")}`,
    })
    .optional(),
  notes: optionalText(INVOICE_POLICY.notes.max, "Notes"),
  terms: optionalText(INVOICE_POLICY.terms.max, "Terms"),
  footer: optionalText(INVOICE_POLICY.footer.max, "Footer"),
  recurringId: z
    .string()
    .cuid("Please select a valid recurring schedule")
    .optional(),
  items: z
    .array(invoiceItemSchema)
    .min(
      INVOICE_POLICY.items.min,
      `At least ${INVOICE_POLICY.items.min} line item is required`,
    )
    .max(
      INVOICE_POLICY.items.max,
      `You can add at most ${INVOICE_POLICY.items.max} line items`,
    ),
});

/* -------------------------------------------------------------------------- */
/*                                  Schemas                                   */
/* -------------------------------------------------------------------------- */

export const createInvoiceSchema = z.object({
  body: invoiceCoreSchema.superRefine((data, ctx) => {
    const issue = data.issueDate ?? new Date();
    const due = data.dueDate;
    if (due && due.getTime() < issue.getTime()) {
      ctx.addIssue({
        code: "custom",
        message: "Due date cannot be before the issue date",
        path: ["dueDate"],
      });
    }
    if (
      data.discountType === "PERCENTAGE" &&
      (data.discount ?? 0) > 100
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Percentage discount cannot exceed 100%",
        path: ["discount"],
      });
    }
    if (
      data.discountType === "FIXED" &&
      data.discount !== undefined &&
      data.items.length > 0
    ) {
      const subtotal = data.items.reduce(
        (sum, item) => sum + item.quantity * item.rate,
        0,
      );
      if (data.discount > subtotal) {
        ctx.addIssue({
          code: "custom",
          message: "Fixed discount cannot exceed the invoice subtotal",
          path: ["discount"],
        });
      }
    }
  }),
});

export const updateInvoiceSchema = z.object({
  params: cuidParamSchema,
  body: invoiceCoreSchema
    .partial()
    .extend({
      items: z.array(invoiceItemSchema).min(1).max(INVOICE_POLICY.items.max).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "Provide at least one field to update",
    })
    .superRefine((data, ctx) => {
      if (data.issueDate && data.dueDate) {
        if (data.dueDate.getTime() < data.issueDate.getTime()) {
          ctx.addIssue({
            code: "custom",
            message: "Due date cannot be before the issue date",
            path: ["dueDate"],
          });
        }
      }
      if (
        data.discountType === "PERCENTAGE" &&
        data.discount !== undefined &&
        data.discount > 100
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Percentage discount cannot exceed 100%",
          path: ["discount"],
        });
      }
    }),
});

export const invoiceIdParamSchema = z.object({
  params: cuidParamSchema,
});

export const updateInvoiceStatusSchema = z.object({
  params: cuidParamSchema,
  body: z
    .object({
      status: z.enum(INVOICE_STATUSES, {
        message: `Status must be one of: ${INVOICE_STATUSES.join(", ")}`,
      }),
      paidAmount: z
        .number({ message: "Paid amount must be a number" })
        .min(0, "Paid amount cannot be negative")
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (data.status === "PARTIALLY_PAID" && data.paidAmount === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Paid amount is required when marking as partially paid",
          path: ["paidAmount"],
        });
      }
    }),
});

export const listInvoicesQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(80).optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    overdue: z
      .union([z.literal("true"), z.literal("false")])
      .transform((v) => v === "true")
      .optional(),
    clientId: z.string().cuid().optional(),
    recurringId: z.string().cuid().optional(),
    fromDate: z
      .union([z.string().datetime(), z.coerce.date()])
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
    toDate: z
      .union([z.string().datetime(), z.coerce.date()])
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
    sortBy: z
      .enum(["createdAt", "issueDate", "dueDate", "number", "total", "status"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>["body"];
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>["body"];
export type UpdateInvoiceStatusInput = z.infer<
  typeof updateInvoiceStatusSchema
>["body"];
export type ListInvoicesQuery = z.infer<
  typeof listInvoicesQuerySchema
>["query"];

const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address")
  .optional();

const invoiceMessageSchema = z
  .string()
  .trim()
  .max(INVOICE_EMAIL_POLICY.message.max, "Message is too long")
  .optional()
  .or(z.literal(""));

export const sendInvoiceSchema = z.object({
  params: cuidParamSchema,
  body: z
    .object({
      to: optionalEmailSchema,
      message: invoiceMessageSchema,
    })
    .default({}),
});

export const remindInvoiceSchema = z.object({
  params: cuidParamSchema,
  body: z
    .object({
      to: optionalEmailSchema,
      message: invoiceMessageSchema,
    })
    .default({}),
});

export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>["body"];
export type RemindInvoiceInput = z.infer<typeof remindInvoiceSchema>["body"];
