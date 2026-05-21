import type { Request } from "express";

import type { SubscriptionPlan, UserRole } from "../../../generated/prisma/client";
import { auth, isGithubEnabled, isGoogleEnabled } from "../../lib/auth";
import { getSession } from "../../lib/auth-session";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";
import { logger } from "../../shared/logger";
import { getPlanLimits } from "../../constants/plans";
import { ensureUserBootstrapped } from "../../services/user/bootstrapUser";
import { writeAuditLog } from "../../services/audit/auditLog.service";

import type {
  ChangePasswordInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  UpdateProfileInput,
  VerifyEmailInput,
} from "./auth.validation";
import { OAUTH_PROVIDERS, type OAuthProvider } from "./auth.constants";
import {
  getAuthHeaders,
  getRequestIp,
  safeCallbackUrl,
  safeUser,
  translateBetterAuthError,
} from "./auth.helpers";

/* -------------------------------------------------------------------------- */
/*                                Common output                               */
/* -------------------------------------------------------------------------- */

export type AuthResult = {
  user: ReturnType<typeof safeUser>;
  /** Top-level role for quick role-based UI / redirect on the client. */
  role: UserRole;
  /** Current subscription plan ("FREE" if none). */
  plan: SubscriptionPlan;
  isVerified: boolean;
  isActive: boolean;
  token?: string;
  setCookie?: string[];
};

function extractSetCookies(response: Response | undefined): string[] {
  if (!response) return [];
  const headers = response.headers;
  if (typeof (headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie === "function") {
    return (headers as unknown as { getSetCookie: () => string[] }).getSetCookie();
  }
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

/* -------------------------------------------------------------------------- */
/*                                  Register                                  */
/* -------------------------------------------------------------------------- */

export async function registerUser(
  req: Request,
  input: RegisterInput,
): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(409, "An account with this email already exists", {
      code: "EMAIL_ALREADY_REGISTERED",
    });
  }

  let setCookie: string[] = [];
  let token: string | undefined;
  let createdUser: { id: string; email: string; name: string } | null = null;

  try {
    const result = await auth.api.signUpEmail({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
      },
      headers: getAuthHeaders(req),
      asResponse: true,
    });

    setCookie = extractSetCookies(result as unknown as Response);
    const json = (await result.json()) as {
      user?: { id: string; email: string; name: string };
      token?: string;
    };
    token = json.token;
    createdUser = json.user ?? null;
  } catch (e) {
    translateBetterAuthError(e);
  }

  if (!createdUser) {
    throw new ApiError(500, "Failed to create account", {
      code: "REGISTRATION_FAILED",
    });
  }

  await ensureUserBootstrapped({
    id: createdUser.id,
    email: createdUser.email,
    name: createdUser.name,
  });

  const [fullUser, subscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: createdUser.id } }),
    prisma.subscription.findUnique({
      where: { userId: createdUser.id },
      select: { plan: true },
    }),
  ]);

  await writeAuditLog({
    userId: createdUser.id,
    action: "auth.register",
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return {
    user: safeUser(fullUser ?? createdUser),
    role: fullUser?.role ?? "USER",
    plan: subscription?.plan ?? "FREE",
    isVerified: fullUser?.isVerified ?? false,
    isActive: fullUser?.isActive ?? true,
    token,
    setCookie,
  };
}

/* -------------------------------------------------------------------------- */
/*                                    Login                                   */
/* -------------------------------------------------------------------------- */

export async function loginUser(
  req: Request,
  input: LoginInput,
): Promise<AuthResult> {
  let setCookie: string[] = [];
  let token: string | undefined;
  let sessionUser: { id: string; email: string } | null = null;

  try {
    const result = await auth.api.signInEmail({
      body: {
        email: input.email,
        password: input.password,
        rememberMe: input.rememberMe,
      },
      headers: getAuthHeaders(req),
      asResponse: true,
    });

    setCookie = extractSetCookies(result as unknown as Response);
    const json = (await result.json()) as {
      user?: { id: string; email: string };
      token?: string;
    };
    sessionUser = json.user ?? null;
    token = json.token;
  } catch (e) {
    translateBetterAuthError(e);
  }

  if (!sessionUser) {
    throw new ApiError(401, "Invalid email or password", {
      code: "INVALID_CREDENTIALS",
    });
  }

  const [user, subscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: sessionUser.id } }),
    prisma.subscription.findUnique({
      where: { userId: sessionUser.id },
      select: { plan: true },
    }),
  ]);

  if (!user || !user.isActive || user.deletedAt) {
    throw new ApiError(403, "Account is not active", { code: "ACCOUNT_INACTIVE" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      loginCount: { increment: 1 },
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "auth.login",
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return {
    user: safeUser(user),
    role: user.role,
    plan: subscription?.plan ?? "FREE",
    isVerified: user.isVerified,
    isActive: user.isActive,
    token,
    setCookie,
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Logout                                   */
/* -------------------------------------------------------------------------- */

export async function logoutUser(req: Request): Promise<{ setCookie: string[] }> {
  try {
    const result = await auth.api.signOut({
      headers: getAuthHeaders(req),
      asResponse: true,
    });
    return { setCookie: extractSetCookies(result as unknown as Response) };
  } catch (e) {
    translateBetterAuthError(e);
  }
}

/* -------------------------------------------------------------------------- */
/*                                     Me                                     */
/* -------------------------------------------------------------------------- */

export async function getCurrentUser(req: Request) {
  const session = await getSession(req);
  if (!session?.user) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }

  const [user, business, subscription, linkedAccounts, activeSessions] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id } }),
      prisma.business.findUnique({ where: { userId: session.user.id } }),
      prisma.subscription.findUnique({ where: { userId: session.user.id } }),
      prisma.account.findMany({
        where: { userId: session.user.id },
        select: { providerId: true, accountId: true, createdAt: true },
      }),
      prisma.session.count({
        where: { userId: session.user.id, expiresAt: { gt: new Date() } },
      }),
    ]);

  if (!user) {
    throw new ApiError(404, "User not found", { code: "USER_NOT_FOUND" });
  }

  const plan = subscription?.plan ?? "FREE";

  return {
    user: safeUser(user),
    // Top-level fields — match the shape returned by /login & /register so the
    // client can use a single response handler everywhere.
    role: user.role,
    plan,
    isVerified: user.isVerified,
    isActive: user.isActive,
    business,
    subscription,
    planLimits: getPlanLimits(plan),
    accounts: linkedAccounts,
    activeSessions,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Password reset                                */
/* -------------------------------------------------------------------------- */

export async function requestPasswordReset(
  req: Request,
  input: ForgotPasswordInput,
): Promise<{ delivered: boolean }> {
  // Always return success-ish to avoid leaking which emails are registered.
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, deletedAt: true, isActive: true },
  });

  if (!existing || existing.deletedAt || !existing.isActive) {
    return { delivered: true };
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email: input.email, redirectTo: "/auth/reset-password" },
      headers: getAuthHeaders(req),
    });
  } catch (e) {
    logger.warn("Better Auth requestPasswordReset failed", { error: String(e) });
  }

  await writeAuditLog({
    userId: existing.id,
    action: "auth.forgot_password_request",
    ipAddress: getRequestIp(req),
  });

  return { delivered: true };
}

export async function resetPassword(
  req: Request,
  input: ResetPasswordInput,
): Promise<void> {
  try {
    await auth.api.resetPassword({
      body: { newPassword: input.newPassword, token: input.token },
      headers: getAuthHeaders(req),
    });
  } catch (e) {
    translateBetterAuthError(e);
  }
}

/* -------------------------------------------------------------------------- */
/*                              Session management                            */
/* -------------------------------------------------------------------------- */

export async function listUserSessions(req: Request) {
  const session = await getSession(req);
  if (!session?.user) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }

  const rows = await prisma.session.findMany({
    where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
      token: true,
    },
  });

  const currentToken =
    (session as unknown as { session?: { token?: string } }).session?.token ??
    null;

  return rows.map((row) => ({
    id: row.id,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    isCurrent: currentToken ? row.token === currentToken : false,
  }));
}

export async function revokeSessionById(
  req: Request,
  sessionId: string,
): Promise<void> {
  const session = await getSession(req);
  if (!session?.user) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }

  // Only allow revoking sessions owned by the calling user.
  const result = await prisma.session.deleteMany({
    where: { id: sessionId, userId: session.user.id },
  });
  if (result.count === 0) {
    throw new ApiError(404, "Session not found", { code: "SESSION_NOT_FOUND" });
  }

  await writeAuditLog({
    userId: session.user.id,
    action: "auth.session_revoke",
    metadata: { sessionId },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });
}

export async function revokeOtherSessions(
  req: Request,
): Promise<{ revoked: number }> {
  const session = await getSession(req);
  if (!session?.user) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }

  const currentToken =
    (session as unknown as { session?: { token?: string } }).session?.token;

  const result = await prisma.session.deleteMany({
    where: {
      userId: session.user.id,
      ...(currentToken ? { token: { not: currentToken } } : {}),
    },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: "auth.sessions_revoke_others",
    metadata: { count: result.count },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return { revoked: result.count };
}

/* -------------------------------------------------------------------------- */
/*                              Email verification                            */
/* -------------------------------------------------------------------------- */

export async function verifyEmail(
  req: Request,
  input: VerifyEmailInput,
): Promise<{ setCookie: string[] }> {
  try {
    const result = await auth.api.verifyEmail({
      query: { token: input.token },
      headers: getAuthHeaders(req),
      asResponse: true,
    });
    return { setCookie: extractSetCookies(result as unknown as Response) };
  } catch (e) {
    translateBetterAuthError(e);
  }
}

export async function resendVerificationEmail(
  req: Request,
  input: ResendVerificationInput,
): Promise<{ delivered: boolean }> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, isVerified: true, deletedAt: true, isActive: true },
  });

  if (!existing || existing.deletedAt || !existing.isActive) {
    return { delivered: true };
  }

  if (existing.isVerified) {
    throw new ApiError(409, "This email is already verified", {
      code: "EMAIL_ALREADY_VERIFIED",
    });
  }

  try {
    await auth.api.sendVerificationEmail({
      body: { email: input.email },
      headers: getAuthHeaders(req),
    });
  } catch (e) {
    logger.warn("Better Auth sendVerificationEmail failed", {
      error: String(e),
    });
  }

  return { delivered: true };
}

/* -------------------------------------------------------------------------- */
/*                              Change password                               */
/* -------------------------------------------------------------------------- */

export async function changePassword(
  req: Request,
  input: ChangePasswordInput,
): Promise<{ setCookie: string[] }> {
  try {
    const result = await auth.api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: input.revokeOtherSessions ?? true,
      },
      headers: getAuthHeaders(req),
      asResponse: true,
    });

    const session = await getSession(req);
    if (session?.user) {
      await writeAuditLog({
        userId: session.user.id,
        action: "auth.change_password",
        ipAddress: getRequestIp(req),
      });
    }

    return { setCookie: extractSetCookies(result as unknown as Response) };
  } catch (e) {
    translateBetterAuthError(e);
  }
}

/* -------------------------------------------------------------------------- */
/*                              Update profile                                */
/* -------------------------------------------------------------------------- */

export async function updateProfile(
  req: Request,
  input: UpdateProfileInput,
) {
  const session = await getSession(req);
  if (!session?.user) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }

  const data: { name?: string; avatar?: string | null } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.avatar !== undefined) {
    data.avatar = input.avatar === "" ? null : input.avatar;
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, "Nothing to update", { code: "NO_FIELDS_PROVIDED" });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
  });

  await writeAuditLog({
    userId: session.user.id,
    action: "auth.update_profile",
    metadata: data as Record<string, string | null>,
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return {
    user: safeUser(updated),
    role: updated.role,
    isVerified: updated.isVerified,
    isActive: updated.isActive,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Delete account                                */
/* -------------------------------------------------------------------------- */

export async function deleteAccount(
  req: Request,
  input: DeleteAccountInput,
): Promise<{ setCookie: string[] }> {
  const session = await getSession(req);
  if (!session?.user) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (!user) {
    throw new ApiError(404, "User not found", { code: "USER_NOT_FOUND" });
  }

  // Block last SUPER_ADMIN from self-deleting (prevents platform lockout)
  if (user.role === "SUPER_ADMIN") {
    const adminCount = await prisma.user.count({
      where: { role: "SUPER_ADMIN", isActive: true, deletedAt: null },
    });
    if (adminCount <= 1) {
      throw new ApiError(
        403,
        "Cannot delete the last super admin. Promote another user first.",
        { code: "LAST_SUPER_ADMIN" },
      );
    }
  }

  // If a password was provided, verify it by attempting a sign-in (Better Auth
  // doesn't expose a stand-alone verify endpoint). For OAuth-only accounts the
  // user passes no password and the route relies on the `confirm: "DELETE"`
  // confirmation literal (enforced by the Zod schema).
  if (input.password && user) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    if (dbUser?.email) {
      try {
        await auth.api.signInEmail({
          body: { email: dbUser.email, password: input.password },
          headers: getAuthHeaders(req),
          asResponse: true,
        });
      } catch (e) {
        // Map auth errors but disguise them as "incorrect password"
        try {
          translateBetterAuthError(e);
        } catch {
          throw new ApiError(401, "Incorrect password", {
            code: "INVALID_PASSWORD",
          });
        }
      }
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });

  // Revoke all sessions so the deleted user is logged out everywhere.
  await prisma.session.deleteMany({ where: { userId: session.user.id } });

  await writeAuditLog({
    userId: session.user.id,
    action: "auth.delete_account",
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  let setCookie: string[] = [];
  try {
    const result = await auth.api.signOut({
      headers: getAuthHeaders(req),
      asResponse: true,
    });
    setCookie = extractSetCookies(result as unknown as Response);
  } catch (e) {
    logger.warn("Sign-out after delete failed", { error: String(e) });
  }

  return { setCookie };
}

/* -------------------------------------------------------------------------- */
/*                                Social login                                */
/* -------------------------------------------------------------------------- */

export function assertProviderEnabled(provider: OAuthProvider): void {
  if (!OAUTH_PROVIDERS.includes(provider)) {
    throw new ApiError(400, `Unsupported OAuth provider: ${provider}`, {
      code: "INVALID_PROVIDER",
    });
  }

  if (provider === "google" && !isGoogleEnabled) {
    throw new ApiError(503, "Google sign-in is not configured", {
      code: "GOOGLE_NOT_CONFIGURED",
    });
  }
  if (provider === "github" && !isGithubEnabled) {
    throw new ApiError(503, "GitHub sign-in is not configured", {
      code: "GITHUB_NOT_CONFIGURED",
    });
  }
}

export async function buildSocialSignInUrl(
  req: Request,
  provider: OAuthProvider,
  callbackURL?: string,
): Promise<string> {
  assertProviderEnabled(provider);

  // Guard against open-redirect: only accept callbacks that point to our own
  // trusted frontend origins. Anything else falls back to CLIENT_URL.
  const safeCallback = safeCallbackUrl(callbackURL);

  try {
    const res = (await auth.api.signInSocial({
      body: {
        provider,
        callbackURL: safeCallback,
      },
      headers: getAuthHeaders(req),
    })) as { url?: string; redirect?: boolean };

    if (!res?.url) {
      throw new ApiError(500, "Failed to start OAuth flow", {
        code: "OAUTH_INIT_FAILED",
      });
    }

    return res.url;
  } catch (e) {
    translateBetterAuthError(e);
  }
}
