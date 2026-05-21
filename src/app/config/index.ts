import type { Env } from "./env";
import { getEnv } from "./env";

const env: Env = getEnv();

function corsOriginsList(): string[] {
  if (env.CORS_ORIGINS?.trim()) {
    return env.CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [env.CLIENT_URL];
}

/**
 * Application configuration derived from validated env.
 * Import this instead of reading `process.env` in features.
 */
export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",

  port: env.PORT,

  databaseUrl: env.DATABASE_URL,

  clientUrl: env.CLIENT_URL,
  corsOrigins: corsOriginsList(),

  trustProxy: Boolean(env.TRUST_PROXY),

  requestTimeoutMs: env.REQUEST_TIMEOUT_MS,

  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: env.RATE_LIMIT_MAX,

  betterAuthSecret: env.BETTER_AUTH_SECRET,
  betterAuthUrl: env.BETTER_AUTH_URL,

  googleClientId: env.GOOGLE_CLIENT_ID,
  googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  githubClientId: env.GITHUB_CLIENT_ID,
  githubClientSecret: env.GITHUB_CLIENT_SECRET,

  logLevel: env.LOG_LEVEL,

  redisUrl: env.REDIS_URL,

  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },

  cloudinary: {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    prices: {
      proMonthly: env.STRIPE_PRICE_PRO_MONTHLY,
      enterpriseMonthly: env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    },
  },

  features: {
    billing: Boolean(env.FEATURE_BILLING),
    auditLog: Boolean(env.FEATURE_AUDIT_LOG),
    scheduledJobs: Boolean(env.FEATURE_SCHEDULED_JOBS),
  },

  scheduledJobsIntervalMs: env.SCHEDULED_JOBS_INTERVAL_MS,
} as const;

export type AppConfig = typeof config;
