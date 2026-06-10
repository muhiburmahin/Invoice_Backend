import type { CorsOptions } from "cors";

/** Vercel preview + production frontend deployments. */
const VERCEL_ORIGIN =
  /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i;

function buildAllowedOrigins(): string[] {
  const fromEnv = [
    process.env.APP_URL,
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.PROD_APP_URL,
    process.env.CORS_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => value!.split(",").map((s) => s.trim()))
    .filter(Boolean);

  return [...new Set(fromEnv)];
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const allowedOrigins = buildAllowedOrigins();

  return (
    allowedOrigins.includes(origin) ||
    VERCEL_ORIGIN.test(origin)
  );
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposedHeaders: ["Set-Cookie"],
};
