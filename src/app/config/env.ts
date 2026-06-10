import { z } from "zod";

import { applyLegacyEnvAliases } from "./legacyEnv";

/**
 * Validated process.env — parsed once on import. Fails fast on boot if invalid.
 * Keep in sync with `.env.example`.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    PORT: z.coerce.number().int().positive().default(5000),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    CLIENT_URL: z.string().url().default("http://localhost:5173"),
    /** Production frontend URL (Vercel production domain). */
    PROD_APP_URL: z.string().url().optional(),
    /** Comma-separated allowed browser origins (SaaS). Defaults to CLIENT_URL only. */
    CORS_ORIGINS: z.string().optional(),

    /** Behind reverse proxy (nginx, render, fly) — sets Express trust proxy */
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "1"),

    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

    BETTER_AUTH_SECRET: z.string().optional(),
    BETTER_AUTH_URL: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    LOG_LEVEL: z.string().optional(),

    REDIS_URL: z.string().optional(),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_SECURE: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "1"),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),

    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
    STRIPE_PRICE_ENTERPRISE_MONTHLY: z.string().optional(),
    /** Fallback when STRIPE_PRICE_PRO_MONTHLY is empty — amount in smallest currency unit (e.g. 1900 = $19.00) */
    STRIPE_PRO_AMOUNT: z.coerce.number().int().positive().optional(),
    STRIPE_PRO_CURRENCY: z.string().optional().default("usd"),

    FEATURE_BILLING: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "1"),
    FEATURE_OFFLINE_BILLING: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "1"),
    OFFLINE_PRO_PRICE: z.string().optional(),
    OFFLINE_PRO_CURRENCY: z.string().optional().default("BDT"),
    OFFLINE_PAYMENT_BKASH: z.string().optional(),
    OFFLINE_PAYMENT_NAGAD: z.string().optional(),
    OFFLINE_PAYMENT_BANK_NAME: z.string().optional(),
    OFFLINE_PAYMENT_BANK_ACCOUNT: z.string().optional(),
    OFFLINE_PAYMENT_INSTRUCTIONS: z.string().optional(),
    FEATURE_AUDIT_LOG: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "1"),
    FEATURE_SCHEDULED_JOBS: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "1"),
    /** Interval between scheduled job runs (ms). Default: 1 hour. */
    SCHEDULED_JOBS_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000),

    SUPER_ADMIN_EMAIL: z.string().email().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production") {
      if (!val.BETTER_AUTH_SECRET || val.BETTER_AUTH_SECRET.length < 32) {
        ctx.addIssue({
          code: "custom",
          message:
            "BETTER_AUTH_SECRET must be set and at least 32 characters in production",
          path: ["BETTER_AUTH_SECRET"],
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env | null = null;

export function getEnv(): Env {
  if (parsedEnv) return parsedEnv;
  applyLegacyEnvAliases();
  const r = envSchema.safeParse(process.env);
  if (!r.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment variables:");
    for (const issue of r.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  • ${issue.path.join(".") || "root"}: ${issue.message}`);
    }
    process.exit(1);
  }
  parsedEnv = r.data;
  return parsedEnv;
}
