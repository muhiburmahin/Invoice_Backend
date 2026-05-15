/**
 * Central environment configuration.
 * Prefer this over reading `process.env` directly in feature code.
 */

function n(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const num = Number(v);
  return Number.isFinite(num) ? num : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: n("PORT", 5000),

  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",

  databaseUrl: process.env.DATABASE_URL ?? "",

  betterAuthSecret: process.env.BETTER_AUTH_SECRET,
  betterAuthUrl: process.env.BETTER_AUTH_URL,

  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,

  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,

  logLevel: process.env.LOG_LEVEL,
} as const;
