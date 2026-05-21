import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";

import { config } from "../../config";
import { ApiError } from "../../errors/ApiError";

/** Better Auth's API methods expect a Headers object, not Express headers. */
export function getAuthHeaders(req: Request): Headers {
  return fromNodeHeaders(req.headers);
}

/**
 * Better Auth throws `APIError` with shape `{ status, body: { message, code }}`.
 * Translate those into our `ApiError` so the global handler returns the same JSON shape.
 */
type BetterAuthError = {
  status?: number | string;
  statusCode?: number;
  message?: string;
  body?: { message?: string; code?: string };
  cause?: { code?: string };
};

const STATUS_MAP: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export function translateBetterAuthError(err: unknown): never {
  const e = err as BetterAuthError;
  const rawStatus = e?.status ?? e?.statusCode;
  let status =
    typeof rawStatus === "number"
      ? rawStatus
      : typeof rawStatus === "string"
        ? STATUS_MAP[rawStatus.toUpperCase()] ?? 400
        : 400;

  if (Number.isNaN(status) || status < 100 || status > 599) status = 400;

  const message =
    e?.body?.message ??
    e?.message ??
    "Authentication request failed";

  const code = e?.body?.code ?? e?.cause?.code ?? "AUTH_ERROR";

  throw new ApiError(status, message, { code });
}

/** Helpers to set the Set-Cookie headers from a Better Auth Response onto Express. */
export function forwardSetCookieHeaders(
  source: Response | undefined,
  target: import("express").Response,
): void {
  if (!source) return;
  const headers = source.headers;
  if (typeof (headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie === "function") {
    const cookies = (
      headers as unknown as { getSetCookie: () => string[] }
    ).getSetCookie();
    cookies.forEach((c) => target.append("Set-Cookie", c));
    return;
  }
  const raw = headers.get("set-cookie");
  if (raw) target.append("Set-Cookie", raw);
}

/** Strip sensitive fields from a User row before returning to the client. */
export function safeUser<T extends Record<string, unknown>>(
  user: T,
): Omit<T, "password" | "verificationToken" | "resetPasswordToken" | "refreshToken"> {
  const {
    password: _pw,
    verificationToken: _vt,
    resetPasswordToken: _rt,
    refreshToken: _rf,
    ...rest
  } = user as Record<string, unknown>;
  return rest as Omit<
    T,
    "password" | "verificationToken" | "resetPasswordToken" | "refreshToken"
  >;
}

/** Client IP — respects trust-proxy chain. Used for audit + session record. */
export function getRequestIp(req: Request): string | undefined {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0]?.trim();
  }
  return req.ip;
}

/**
 * Returns a callback URL safe to redirect to after OAuth login.
 *
 * - Relative paths (`/dashboard`, `/billing?foo=bar`) are always accepted.
 * - Absolute URLs are accepted ONLY if their origin matches one of our
 *   trusted CORS origins (i.e. our own frontend deployments).
 * - Anything else is treated as a phishing/open-redirect attempt and the
 *   default `CLIENT_URL` is returned instead.
 */
export function safeCallbackUrl(callbackUrl: string | undefined): string {
  const fallback = config.clientUrl;
  const raw = callbackUrl?.trim();
  if (!raw) return fallback;

  // Allow relative paths as-is — they always resolve on the frontend origin.
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const trusted = new Set(
      [...config.corsOrigins, config.clientUrl]
        .filter(Boolean)
        .map((o) => new URL(o).origin),
    );
    if (trusted.has(parsed.origin)) {
      return raw;
    }
  } catch {
    // Fall through to fallback.
  }
  return fallback;
}
