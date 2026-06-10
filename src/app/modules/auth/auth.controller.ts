import type { Request, RequestHandler, Response } from "express";

import { ApiError } from "../../errors/ApiError";
import { config } from "../../config";
import { sendSuccess } from "../../shared/sendResponse";
import { catchAsync } from "../../shared/catchAsync";
import { passwordRequirements } from "./auth.validation";
import type { OAuthProvider } from "./auth.constants";
import {
  buildSocialSignInUrl,
  changePassword,
  deleteAccount,
  getCurrentUser,
  listUserSessions,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  revokeOtherSessions,
  revokeSessionById,
  updateProfile,
  verifyEmail,
} from "./auth.service";

/** Append `Set-Cookie` headers from Better Auth onto our Express response. */
function applyCookies(res: Response, cookies: string[] | undefined): void {
  if (!cookies || cookies.length === 0) return;
  cookies.forEach((c) => res.append("Set-Cookie", c));
}

/* -------------------------------------------------------------------------- */
/*                                   Public                                   */
/* -------------------------------------------------------------------------- */

export const register: RequestHandler = catchAsync(async (req, res) => {
  const result = await registerUser(req, req.body);
  applyCookies(res, result.setCookie);

  sendSuccess(
    res,
    {
      user: result.user,
      role: result.role,
      plan: result.plan,
      isVerified: result.isVerified,
      isActive: result.isActive,
      token: result.token,
      message:
        "Account created successfully. Please check your email to verify your address.",
    },
    201,
  );
});

export const login: RequestHandler = catchAsync(async (req, res) => {
  const result = await loginUser(req, req.body);
  applyCookies(res, result.setCookie);

  sendSuccess(res, {
    user: result.user,
    role: result.role,
    plan: result.plan,
    isVerified: result.isVerified,
    isActive: result.isActive,
    token: result.token,
    message: "Logged in successfully",
  });
});

export const forgotPassword: RequestHandler = catchAsync(async (req, res) => {
  await requestPasswordReset(req, req.body);
  sendSuccess(res, {
    message:
      "If an account with that email exists, a password reset link has been sent.",
  });
});

export const resetPasswordHandler: RequestHandler = catchAsync(async (req, res) => {
  await resetPassword(req, req.body);
  sendSuccess(res, {
    message: "Password has been reset successfully. You can now sign in.",
  });
});

export const verifyEmailHandler: RequestHandler = catchAsync(async (req, res) => {
  const result = await verifyEmail(req, req.body);
  applyCookies(res, result.setCookie);
  sendSuccess(res, {
    message: "Email verified successfully.",
  });
});

export const resendVerification: RequestHandler = catchAsync(async (req, res) => {
  await resendVerificationEmail(req, req.body);
  sendSuccess(res, {
    message:
      "If the account exists and is unverified, a verification link has been sent.",
  });
});

/** Password policy exposed so the signup form can render requirements as hints / toasts. */
export const passwordPolicy: RequestHandler = (_req, res) => {
  sendSuccess(res, { requirements: passwordRequirements });
};

/* -------------------------------------------------------------------------- */
/*                                Social login                                */
/* -------------------------------------------------------------------------- */

function resolveCallbackUrl(req: Request): string | undefined {
  const fromQuery = (req.query.redirect as string | undefined)?.trim();
  if (fromQuery) return fromQuery;
  return undefined;
}

export const googleStart: RequestHandler = catchAsync(async (req, res) => {
  const { url, setCookie } = await buildSocialSignInUrl(
    req,
    "google",
    resolveCallbackUrl(req),
  );
  applyCookies(res, setCookie);
  res.redirect(url);
});

export const socialStart: RequestHandler = catchAsync(async (req, res) => {
  const provider = req.params.provider as OAuthProvider;
  const { url, setCookie } = await buildSocialSignInUrl(
    req,
    provider,
    resolveCallbackUrl(req),
  );
  applyCookies(res, setCookie);
  res.redirect(url);
});

/** Frontend can call this instead of redirecting — useful for popup OAuth. */
export const socialUrl: RequestHandler = catchAsync(async (req, res) => {
  const provider = req.params.provider as OAuthProvider;
  const { url, setCookie } = await buildSocialSignInUrl(
    req,
    provider,
    resolveCallbackUrl(req),
  );
  applyCookies(res, setCookie);
  sendSuccess(res, { url, provider });
});

/* -------------------------------------------------------------------------- */
/*                                 Protected                                  */
/* -------------------------------------------------------------------------- */

export const me: RequestHandler = catchAsync(async (req, res) => {
  const data = await getCurrentUser(req);
  sendSuccess(res, data);
});

export const logout: RequestHandler = catchAsync(async (req, res) => {
  const result = await logoutUser(req);
  applyCookies(res, result.setCookie);
  sendSuccess(res, { message: "Logged out successfully" });
});

export const changePasswordHandler: RequestHandler = catchAsync(async (req, res) => {
  const result = await changePassword(req, req.body);
  applyCookies(res, result.setCookie);
  sendSuccess(res, {
    message: "Password changed successfully",
  });
});

export const updateProfileHandler: RequestHandler = catchAsync(async (req, res) => {
  const result = await updateProfile(req, req.body);
  sendSuccess(res, {
    user: result.user,
    role: result.role,
    isVerified: result.isVerified,
    isActive: result.isActive,
    message: "Profile updated successfully",
  });
});

export const deleteAccountHandler: RequestHandler = catchAsync(async (req, res) => {
  const result = await deleteAccount(req, req.body);
  applyCookies(res, result.setCookie);
  sendSuccess(res, { message: "Account deleted successfully" });
});

/* -------------------------------------------------------------------------- */
/*                            Session management                              */
/* -------------------------------------------------------------------------- */

export const listSessionsHandler: RequestHandler = catchAsync(async (req, res) => {
  const sessions = await listUserSessions(req);
  sendSuccess(res, { sessions });
});

export const revokeSessionHandler: RequestHandler = catchAsync(async (req, res) => {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) {
    throw new ApiError(400, "Session id is required", { code: "MISSING_PARAM" });
  }
  await revokeSessionById(req, id);
  sendSuccess(res, { message: "Session revoked" });
});

export const revokeOtherSessionsHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const result = await revokeOtherSessions(req);
    sendSuccess(res, {
      revoked: result.revoked,
      message: `${result.revoked} other session(s) revoked`,
    });
  },
);

/* -------------------------------------------------------------------------- */
/*                                Config probe                                */
/* -------------------------------------------------------------------------- */

export const authConfig: RequestHandler = (_req, res) => {
  sendSuccess(res, {
    providers: {
      google: Boolean(config.googleClientId && config.googleClientSecret),
      github: Boolean(config.githubClientId && config.githubClientSecret),
      emailPassword: true,
    },
    passwordRequirements,
  });
};
