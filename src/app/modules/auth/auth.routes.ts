import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  bootstrapUser,
  requireActiveUser,
  requireAuth,
  validateRequest,
} from "../../middlewares";

import {
  authConfig,
  changePasswordHandler,
  deleteAccountHandler,
  forgotPassword,
  googleStart,
  listSessionsHandler,
  login,
  logout,
  me,
  passwordPolicy,
  register,
  resendVerification,
  resetPasswordHandler,
  revokeOtherSessionsHandler,
  revokeSessionHandler,
  socialStart,
  socialUrl,
  updateProfileHandler,
  verifyEmailHandler,
} from "./auth.controller";
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  googleStartSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionIdParamSchema,
  socialStartParamsSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from "./auth.validation";

const authRouter = Router();

/* -------------------------------------------------------------------------- */
/*                              Rate limiters                                 */
/* -------------------------------------------------------------------------- */

const strict = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

const moderate = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again in a few minutes.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

/* -------------------------------------------------------------------------- */
/*                                  Public                                    */
/* -------------------------------------------------------------------------- */

authRouter.get("/config", authConfig);
authRouter.get("/password-policy", passwordPolicy);

authRouter.post(
  "/register",
  strict,
  validateRequest({ body: registerSchema.shape.body }),
  register,
);

authRouter.post(
  "/login",
  strict,
  validateRequest({ body: loginSchema.shape.body }),
  login,
);

authRouter.post(
  "/forgot-password",
  strict,
  validateRequest({ body: forgotPasswordSchema.shape.body }),
  forgotPassword,
);

authRouter.post(
  "/reset-password",
  strict,
  validateRequest({ body: resetPasswordSchema.shape.body }),
  resetPasswordHandler,
);

authRouter.post(
  "/verify-email",
  moderate,
  validateRequest({ body: verifyEmailSchema.shape.body }),
  verifyEmailHandler,
);

authRouter.post(
  "/resend-verification",
  strict,
  validateRequest({ body: resendVerificationSchema.shape.body }),
  resendVerification,
);

/* ----------------------------- Social / OAuth ----------------------------- */

authRouter.get(
  "/google",
  moderate,
  validateRequest({ query: googleStartSchema.shape.query }),
  googleStart,
);

authRouter.get(
  "/social/:provider",
  moderate,
  validateRequest({
    params: socialStartParamsSchema.shape.params,
    query: socialStartParamsSchema.shape.query,
  }),
  socialStart,
);

authRouter.get(
  "/social/:provider/url",
  moderate,
  validateRequest({
    params: socialStartParamsSchema.shape.params,
    query: socialStartParamsSchema.shape.query,
  }),
  socialUrl,
);

/* -------------------------------------------------------------------------- */
/*                                Protected                                   */
/* -------------------------------------------------------------------------- */

const protectedAuth = Router();
protectedAuth.use(requireAuth, requireActiveUser, bootstrapUser);

protectedAuth.get("/me", me);

protectedAuth.post("/logout", logout);

protectedAuth.post(
  "/change-password",
  strict,
  validateRequest({ body: changePasswordSchema.shape.body }),
  changePasswordHandler,
);

protectedAuth.patch(
  "/profile",
  moderate,
  validateRequest({ body: updateProfileSchema.shape.body }),
  updateProfileHandler,
);

protectedAuth.delete(
  "/account",
  strict,
  validateRequest({ body: deleteAccountSchema.shape.body }),
  deleteAccountHandler,
);

/* ----------------------------- Sessions API ------------------------------- */

protectedAuth.get("/sessions", listSessionsHandler);

protectedAuth.delete(
  "/sessions/others",
  strict,
  revokeOtherSessionsHandler,
);

protectedAuth.delete(
  "/sessions/:id",
  strict,
  validateRequest({ params: sessionIdParamSchema.shape.params }),
  revokeSessionHandler,
);

authRouter.use(protectedAuth);

export { authRouter };
