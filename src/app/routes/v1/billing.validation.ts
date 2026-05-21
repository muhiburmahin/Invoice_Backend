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
