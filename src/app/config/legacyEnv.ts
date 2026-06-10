/**
 * Maps older `.env` variable names to the canonical names used by `env.ts`.
 * Call once before Zod validation so existing deployments keep working.
 */
export function applyLegacyEnvAliases(): void {
  const setIfMissing = (target: string, ...sources: string[]) => {
    if (process.env[target]?.trim()) return;
    for (const key of sources) {
      const value = process.env[key]?.trim();
      if (value) {
        process.env[target] = value;
        return;
      }
    }
  };

  setIfMissing("CLIENT_URL", "FRONTEND_URL", "APP_URL", "PROD_APP_URL");
  // Better Auth callback must use the public frontend origin (Next.js proxies /api/auth).
  setIfMissing("BETTER_AUTH_URL", "CLIENT_URL", "FRONTEND_URL", "APP_URL", "PROD_APP_URL");

  setIfMissing("SMTP_HOST", "EMAIL_SENDER_SMTP_HOST");
  setIfMissing("SMTP_PORT", "EMAIL_SENDER_SMTP_PORT");
  setIfMissing("SMTP_USER", "EMAIL_USER");
  setIfMissing("SMTP_PASS", "EMAIL_PASSWORD");
  setIfMissing("SMTP_FROM", "EMAIL_SENDER_SMTP_FROM");

  if (!process.env.SMTP_SECURE?.trim()) {
    const port = Number(process.env.SMTP_PORT ?? process.env.EMAIL_SENDER_SMTP_PORT);
    if (port === 465) {
      process.env.SMTP_SECURE = "true";
    }
  }

  if (!process.env.CORS_ORIGINS?.trim() && process.env.CLIENT_URL?.trim()) {
    const extras = [process.env.FRONTEND_URL, process.env.APP_URL]
      .map((v) => v?.trim())
      .filter(Boolean) as string[];
    const unique = [...new Set([process.env.CLIENT_URL.trim(), ...extras])];
    if (unique.length > 1) {
      process.env.CORS_ORIGINS = unique.join(",");
    }
  }
}
