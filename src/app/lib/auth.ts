import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { config } from "../config";
import { prisma } from "../shared/prisma";
import { logger } from "../shared/logger";
import { isEmailConfigured, sendTransactionalMail } from "../services/email";

const secret =
  config.betterAuthSecret ??
  (config.nodeEnv !== "production"
    ? "dev-better-auth-secret-min-32-characters-long!!"
    : undefined);

if (!secret) {
  throw new Error("Set BETTER_AUTH_SECRET (min 32 characters) for Better Auth.");
}

const baseURL = config.betterAuthUrl ?? `http://localhost:${config.port}`;

const googleEnabled =
  Boolean(config.googleClientId) && Boolean(config.googleClientSecret);

const githubEnabled =
  Boolean(config.githubClientId) && Boolean(config.githubClientSecret);

/** Replace Better Auth's default callback URL host with our public frontend URL. */
function toFrontendUrl(path: string, token: string): string {
  const url = new URL(path, config.clientUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

async function safeSendMail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  if (!isEmailConfigured()) {
    logger.warn("Email not configured — skipping send", { to, subject });
    return;
  }
  try {
    await sendTransactionalMail({ to, subject, html, text });
  } catch (e) {
    logger.error("Failed to send transactional email", {
      to,
      subject,
      error: String(e),
    });
  }
}

export const auth = betterAuth({
  appName: "Invoice",
  basePath: "/api/auth",
  secret,
  baseURL,
  trustedOrigins: [config.clientUrl, baseURL],

  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: false,
  }),

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const { ensureUserBootstrapped } = await import(
            "../services/user/bootstrapUser"
          );
          await ensureUserBootstrapped({
            id: user.id,
            email: user.email,
            name: user.name ?? user.email,
          });
        },
      },
    },
  },

  user: {
    modelName: "User",
    fields: {
      emailVerified: "isVerified",
      image: "avatar",
    },
  },

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, token }) => {
      const resetUrl = toFrontendUrl("/auth/reset-password", token);
      await safeSendMail(
        user.email,
        "Reset your Invoice password",
        `<p>Hi ${user.name ?? "there"},</p>
         <p>You requested to reset your password. Click the link below to set a new one. This link expires in 1 hour.</p>
         <p><a href="${resetUrl}" target="_blank" rel="noopener">Reset Password</a></p>
         <p>If you did not request this, you can safely ignore this email.</p>`,
        `Reset your Invoice password: ${resetUrl} (expires in 1 hour)`,
      );
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const verifyUrl = toFrontendUrl("/auth/verify-email", token);
      await safeSendMail(
        user.email,
        "Verify your Invoice email",
        `<p>Hi ${user.name ?? "there"},</p>
         <p>Welcome to Invoice! Please verify your email address by clicking the link below.</p>
         <p><a href="${verifyUrl}" target="_blank" rel="noopener">Verify Email</a></p>
         <p>This link will expire in 24 hours.</p>`,
        `Verify your Invoice email: ${verifyUrl} (expires in 24 hours)`,
      );
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  advanced: {
    crossSubDomainCookies: { enabled: false },
    useSecureCookies: config.isProduction,
    defaultCookieAttributes: {
      sameSite: config.isProduction ? "none" : "lax",
      secure: config.isProduction,
      httpOnly: true,
    },
  },

  socialProviders: {
    ...(googleEnabled
      ? {
          google: {
            clientId: config.googleClientId as string,
            clientSecret: config.googleClientSecret as string,
          },
        }
      : {}),
    ...(githubEnabled
      ? {
          github: {
            clientId: config.githubClientId as string,
            clientSecret: config.githubClientSecret as string,
          },
        }
      : {}),
  },
});

export const isGoogleEnabled = googleEnabled;
export const isGithubEnabled = githubEnabled;
