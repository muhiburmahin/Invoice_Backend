import { z } from "zod";

import { NAME_POLICY, OAUTH_PROVIDERS, PASSWORD_POLICY } from "./auth.constants";

/**
 * Single source of truth for the password policy.
 * Every rule is its own `.refine()` with a unique message so the frontend can
 * render every failure as a separate toast / inline check.
 */
const passwordRulesSchema = z
  .string({ message: "Password is required" })
  .min(PASSWORD_POLICY.minLength, {
    message: `Password must be at least ${PASSWORD_POLICY.minLength} characters long`,
  })
  .max(PASSWORD_POLICY.maxLength, {
    message: `Password cannot exceed ${PASSWORD_POLICY.maxLength} characters`,
  })
  .refine((val) => !/\s/.test(val), {
    message: "Password must not contain spaces",
  })
  .refine(
    (val) => !PASSWORD_POLICY.requireLowercase || /[a-z]/.test(val),
    { message: "Password must contain at least one lowercase letter (a-z)" },
  )
  .refine(
    (val) => !PASSWORD_POLICY.requireUppercase || /[A-Z]/.test(val),
    { message: "Password must contain at least one uppercase letter (A-Z)" },
  )
  .refine(
    (val) => !PASSWORD_POLICY.requireNumber || /[0-9]/.test(val),
    { message: "Password must contain at least one number (0-9)" },
  )
  .refine(
    (val) =>
      !PASSWORD_POLICY.requireSpecial ||
      /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/.test(val),
    {
      message:
        "Password must contain at least one special character (e.g. !@#$%^&*)",
    },
  );

const emailSchema = z
  .string({ message: "Email is required" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Please enter a valid email address");

const nameSchema = z
  .string({ message: "Name is required" })
  .trim()
  .min(NAME_POLICY.minLength, {
    message: `Name must be at least ${NAME_POLICY.minLength} characters`,
  })
  .max(NAME_POLICY.maxLength, {
    message: `Name cannot exceed ${NAME_POLICY.maxLength} characters`,
  })
  .regex(/^[\p{L}\p{N} .'-]+$/u, {
    message:
      "Name can only contain letters, numbers, spaces, dots, apostrophes and hyphens",
  });

const tokenSchema = z
  .string({ message: "Token is required" })
  .trim()
  .min(10, "Invalid or expired token")
  .max(512, "Invalid or expired token");

const callbackUrlSchema = z
  .string()
  .trim()
  .max(2048, "Callback URL is too long")
  .url("Callback URL must be a valid URL")
  .optional();

/* -------------------------------------------------------------------------- */
/*                                  Schemas                                   */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  body: z
    .object({
      name: nameSchema,
      email: emailSchema,
      password: passwordRulesSchema,
      confirmPassword: z
        .string({ message: "Please confirm your password" })
        .min(1, "Please confirm your password"),
      acceptTerms: z
        .boolean({ message: "You must accept the terms & privacy policy" })
        .refine((v) => v === true, {
          message: "You must accept the terms & privacy policy to continue",
        })
        .optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Password and confirm password do not match",
      path: ["confirmPassword"],
    }),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z
      .string({ message: "Password is required" })
      .min(1, "Password is required")
      .max(PASSWORD_POLICY.maxLength, "Password is too long"),
    rememberMe: z.boolean().optional(),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

export const resetPasswordSchema = z.object({
  body: z
    .object({
      token: tokenSchema,
      newPassword: passwordRulesSchema,
      confirmPassword: z
        .string({ message: "Please confirm your new password" })
        .min(1, "Please confirm your new password"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "New password and confirm password do not match",
      path: ["confirmPassword"],
    }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z
        .string({ message: "Current password is required" })
        .min(1, "Current password is required"),
      newPassword: passwordRulesSchema,
      confirmPassword: z
        .string({ message: "Please confirm your new password" })
        .min(1, "Please confirm your new password"),
      revokeOtherSessions: z.boolean().optional(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "New password and confirm password do not match",
      path: ["confirmPassword"],
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      message: "New password must be different from current password",
      path: ["newPassword"],
    }),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: tokenSchema,
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

export const updateProfileSchema = z.object({
  body: z
    .object({
      name: nameSchema.optional(),
      avatar: z
        .string()
        .trim()
        .url("Avatar must be a valid URL")
        .max(2048, "Avatar URL is too long")
        .optional()
        .or(z.literal("")),
    })
    .refine(
      (data) =>
        data.name !== undefined || data.avatar !== undefined,
      { message: "Provide at least one field to update (name or avatar)" },
    ),
});

export const socialStartParamsSchema = z.object({
  params: z.object({
    provider: z.enum(OAUTH_PROVIDERS, {
      message: `Provider must be one of: ${OAUTH_PROVIDERS.join(", ")}`,
    }),
  }),
  query: z.object({
    redirect: callbackUrlSchema,
  }),
});

export const googleStartSchema = z.object({
  query: z.object({
    redirect: callbackUrlSchema,
  }),
});

export const deleteAccountSchema = z.object({
  body: z.object({
    password: z
      .string({ message: "Password is required to delete your account" })
      .min(1, "Password is required to delete your account")
      .optional(),
    confirm: z
      .literal("DELETE", {
        message: 'Type "DELETE" to confirm account deletion',
      })
      .or(z.boolean().refine((v) => v === true, "Confirmation is required")),
  }),
});

export const sessionIdParamSchema = z.object({
  params: z.object({
    id: z
      .string({ message: "Session id is required" })
      .min(1, "Session id is required"),
  }),
});

/* ------------------------------ Inferred types ----------------------------- */

export type RegisterInput = z.infer<typeof registerSchema>["body"];
export type LoginInput = z.infer<typeof loginSchema>["body"];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>["body"];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>["body"];
export type ResendVerificationInput = z.infer<
  typeof resendVerificationSchema
>["body"];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>["body"];
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>["body"];

/* ------------------------- Client-visible policy --------------------------- */

/**
 * Same rules as the schema — exposed so the frontend can list them
 * in the signup form and as toast hints. Each item is independently visible.
 */
export const passwordRequirements: { id: string; label: string }[] = [
  {
    id: "min",
    label: `At least ${PASSWORD_POLICY.minLength} characters`,
  },
  {
    id: "max",
    label: `No more than ${PASSWORD_POLICY.maxLength} characters`,
  },
  { id: "lower", label: "At least one lowercase letter (a-z)" },
  { id: "upper", label: "At least one uppercase letter (A-Z)" },
  { id: "number", label: "At least one number (0-9)" },
  { id: "special", label: "At least one special character (e.g. !@#$%^&*)" },
  { id: "no-space", label: "No spaces" },
];
