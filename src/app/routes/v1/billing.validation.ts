import { z } from "zod";

export const createPlanCheckoutSchema = z.object({
  body: z.object({
    plan: z.enum(["PRO", "ENTERPRISE"], {
      message: "plan must be PRO or ENTERPRISE",
    }),
    successUrl: z
      .string()
      .url("successUrl must be a valid URL")
      .optional(),
    cancelUrl: z.string().url("cancelUrl must be a valid URL").optional(),
  }),
});

export const createBillingPortalSchema = z.object({
  body: z.object({
    returnUrl: z.string().url("returnUrl must be a valid URL").optional(),
  }),
});

export type CreatePlanCheckoutInput = z.infer<
  typeof createPlanCheckoutSchema
>["body"];
export type CreateBillingPortalInput = z.infer<
  typeof createBillingPortalSchema
>["body"];

export const offlineUpgradeRequestSchema = z.object({
  body: z.object({
    plan: z.enum(["PRO"], { message: "plan must be PRO" }),
    paymentReference: z
      .string()
      .trim()
      .min(4, "Transaction ID must be at least 4 characters")
      .max(120, "Transaction ID is too long"),
    note: z.string().trim().max(500, "Note cannot exceed 500 characters").optional(),
  }),
});

export type OfflineUpgradeRequestInput = z.infer<
  typeof offlineUpgradeRequestSchema
>["body"];
