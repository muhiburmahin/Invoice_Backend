import { z } from "zod";

import { cuidParamSchema } from "../../validation/common.schemas";

import { CLIENT_POLICY, CURRENCY_CODES } from "./client.constants";

/* -------------------------------------------------------------------------- */
/*                              Reusable atoms                                */
/* -------------------------------------------------------------------------- */

const clientEmailSchema = z
  .string({ message: "Email is required" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(CLIENT_POLICY.email.max, "Email is too long")
  .email("Please enter a valid email address");

const clientNameSchema = z
  .string({ message: "Client name is required" })
  .trim()
  .min(CLIENT_POLICY.name.min, "Client name is required")
  .max(
    CLIENT_POLICY.name.max,
    `Client name cannot exceed ${CLIENT_POLICY.name.max} characters`,
  );

const optionalTrimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} cannot exceed ${max} characters`)
    .optional()
    .or(z.literal(""));

const phoneSchema = z
  .union([
    z
      .string()
      .trim()
      .min(5, "Phone number is too short")
      .max(CLIENT_POLICY.phone.max, "Phone number is too long")
      .regex(
        /^[+\d][\d\s()-]*\d$/,
        "Phone can only contain digits, spaces, dashes, parentheses and a leading +",
      ),
    z.literal(""),
    z.null(),
  ])
  .optional();

const tagItemSchema = z
  .string()
  .trim()
  .min(1, "Tag cannot be empty")
  .max(
    CLIENT_POLICY.tags.maxLength,
    `Each tag cannot exceed ${CLIENT_POLICY.tags.maxLength} characters`,
  )
  .regex(
    /^[\p{L}\p{N}_-]+$/u,
    "Tags can only contain letters, numbers, underscores and hyphens",
  );

const tagsSchema = z
  .array(tagItemSchema)
  .max(
    CLIENT_POLICY.tags.maxCount,
    `You can add at most ${CLIENT_POLICY.tags.maxCount} tags`,
  )
  .optional()
  .transform((tags) =>
    tags
      ? [...new Set(tags.map((t) => t.toLowerCase()))]
      : undefined,
  );

const clientFieldsSchema = z.object({
  name: clientNameSchema,
  email: clientEmailSchema,
  company: optionalTrimmed(CLIENT_POLICY.company.max, "Company"),
  phone: phoneSchema,
  address: optionalTrimmed(CLIENT_POLICY.address.max, "Address"),
  city: optionalTrimmed(CLIENT_POLICY.location.max, "City"),
  state: optionalTrimmed(CLIENT_POLICY.location.max, "State"),
  country: optionalTrimmed(CLIENT_POLICY.location.max, "Country"),
  zipCode: optionalTrimmed(20, "Zip code"),
  taxNumber: optionalTrimmed(CLIENT_POLICY.taxNumber.max, "Tax number"),
  currency: z
    .enum(CURRENCY_CODES, {
      message: `Currency must be one of: ${CURRENCY_CODES.join(", ")}`,
    })
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  notes: optionalTrimmed(CLIENT_POLICY.notes.max, "Notes"),
  tags: tagsSchema,
  portalEnabled: z.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/*                                  Schemas                                   */
/* -------------------------------------------------------------------------- */

export const createClientSchema = z.object({
  body: clientFieldsSchema,
});

export const updateClientSchema = z.object({
  params: cuidParamSchema,
  body: clientFieldsSchema
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "Provide at least one field to update",
    }),
});

export const clientIdParamSchema = z.object({
  params: cuidParamSchema,
});

export const updateClientStatusSchema = z.object({
  params: cuidParamSchema,
  body: z.object({
    isActive: z.boolean({ message: "isActive must be true or false" }),
  }),
});

export const listClientsQuerySchema = z.object({
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
    status: z
      .enum(["active", "inactive", "deleted"], {
        message: "status must be active, inactive or deleted",
      })
      .optional(),
    tag: tagItemSchema.optional(),
    sortBy: z
      .enum(["createdAt", "updatedAt", "name", "email"], {
        message: "sortBy must be one of: createdAt, updatedAt, name, email",
      })
      .default("createdAt"),
    sortOrder: z
      .enum(["asc", "desc"], { message: "sortOrder must be asc or desc" })
      .default("desc"),
  }),
});

export type CreateClientInput = z.infer<typeof createClientSchema>["body"];
export type UpdateClientInput = z.infer<typeof updateClientSchema>["body"];
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>["query"];
export type UpdateClientStatusInput = z.infer<
  typeof updateClientStatusSchema
>["body"];
