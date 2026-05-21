import { z } from "zod";

import { BUSINESS_POLICY, CURRENCY_CODES } from "./business.constants";

/* -------------------------------------------------------------------------- */
/*                              Reusable atoms                                */
/* -------------------------------------------------------------------------- */

const optionalTrimmedString = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} cannot exceed ${max} characters`)
    .optional()
    .or(z.literal(""));

const nullableUrl = z
  .union([
    z
      .string()
      .trim()
      .max(2_048, "URL is too long")
      .url("Please provide a valid URL"),
    z.literal(""),
    z.null(),
  ])
  .optional();

const hexColor = z
  .union([
    z
      .string()
      .trim()
      .regex(
        /^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/,
        "Color must be a valid hex code (e.g. #4F46E5 or #abc)",
      )
      .transform((v) => (v.startsWith("#") ? v.toLowerCase() : `#${v.toLowerCase()}`)),
    z.literal(""),
    z.null(),
  ])
  .optional();

const phoneSchema = z
  .union([
    z
      .string()
      .trim()
      .min(5, "Phone number is too short")
      .max(25, "Phone number is too long")
      .regex(
        /^[+\d][\d\s()-]*\d$/,
        "Phone can only contain digits, spaces, dashes, parentheses and a leading +",
      ),
    z.literal(""),
    z.null(),
  ])
  .optional();

const businessEmail = z
  .union([
    z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "Email is too long")
      .email("Please enter a valid email address"),
    z.literal(""),
    z.null(),
  ])
  .optional();

/* -------------------------------------------------------------------------- */
/*                          Update body — every field is optional             */
/* -------------------------------------------------------------------------- */

export const updateBusinessSchema = z.object({
  body: z
    .object({
      name: z
        .string({ message: "Business name is required" })
        .trim()
        .min(BUSINESS_POLICY.name.min, "Business name is required")
        .max(
          BUSINESS_POLICY.name.max,
          `Business name cannot exceed ${BUSINESS_POLICY.name.max} characters`,
        )
        .optional(),

      logo: nullableUrl,
      email: businessEmail,
      phone: phoneSchema,
      website: nullableUrl,

      address: optionalTrimmedString(BUSINESS_POLICY.text.max, "Address"),
      city: optionalTrimmedString(120, "City"),
      state: optionalTrimmedString(120, "State"),
      country: optionalTrimmedString(120, "Country"),
      zipCode: optionalTrimmedString(20, "Zip code"),

      taxNumber: optionalTrimmedString(
        BUSINESS_POLICY.taxNumber.max,
        "Tax number",
      ),
      vatNumber: optionalTrimmedString(
        BUSINESS_POLICY.taxNumber.max,
        "VAT number",
      ),

      currency: z
        .enum(CURRENCY_CODES, {
          message: `Currency must be one of: ${CURRENCY_CODES.join(", ")}`,
        })
        .optional(),

      taxRate: z
        .number({ message: "Tax rate must be a number" })
        .min(BUSINESS_POLICY.taxRate.min, "Tax rate cannot be negative")
        .max(BUSINESS_POLICY.taxRate.max, "Tax rate cannot exceed 100%")
        .optional(),

      invoicePrefix: z
        .string()
        .trim()
        .min(
          BUSINESS_POLICY.invoicePrefix.min,
          "Invoice prefix is required if provided",
        )
        .max(
          BUSINESS_POLICY.invoicePrefix.max,
          `Invoice prefix cannot exceed ${BUSINESS_POLICY.invoicePrefix.max} characters`,
        )
        .regex(
          /^[A-Za-z0-9_-]+$/,
          "Invoice prefix can only contain letters, numbers, dashes and underscores",
        )
        .transform((v) => v.toUpperCase())
        .optional(),

      nextNumber: z
        .number({ message: "Next number must be a whole number" })
        .int("Next number must be a whole number")
        .min(
          BUSINESS_POLICY.nextNumber.min,
          `Next number must be at least ${BUSINESS_POLICY.nextNumber.min}`,
        )
        .max(
          BUSINESS_POLICY.nextNumber.max,
          `Next number cannot exceed ${BUSINESS_POLICY.nextNumber.max}`,
        )
        .optional(),

      defaultDueDays: z
        .number({ message: "Default due days must be a number" })
        .int("Default due days must be a whole number")
        .min(BUSINESS_POLICY.defaultDueDays.min, "Default due days cannot be negative")
        .max(
          BUSINESS_POLICY.defaultDueDays.max,
          `Default due days cannot exceed ${BUSINESS_POLICY.defaultDueDays.max}`,
        )
        .optional(),

      defaultNotes: optionalTrimmedString(
        BUSINESS_POLICY.longText.max,
        "Default notes",
      ),
      defaultTerms: optionalTrimmedString(
        BUSINESS_POLICY.longText.max,
        "Default terms",
      ),

      primaryColor: hexColor,
      accentColor: hexColor,
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "Provide at least one field to update",
    }),
});

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>["body"];
