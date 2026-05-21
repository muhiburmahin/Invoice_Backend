/** Allowed OAuth provider ids exposed by the API. */
export const OAUTH_PROVIDERS = ["google", "github"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/**
 * Password policy — enforced both in Zod validation and shown to the user
 * so they understand each rule (as a toast/inline message).
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: true,
} as const;

/** Cosmetic limits for profile fields. */
export const NAME_POLICY = {
  minLength: 2,
  maxLength: 80,
} as const;

/** Subroutes mounted under `/api/v1/auth`. Kept in one place for clients. */
export const AUTH_ROUTES = {
  register: "/register",
  login: "/login",
  logout: "/logout",
  me: "/me",
  changePassword: "/change-password",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
  resendVerification: "/resend-verification",
  updateProfile: "/profile",
  deleteAccount: "/account",
  googleStart: "/google",
  socialStart: "/social/:provider",
} as const;
