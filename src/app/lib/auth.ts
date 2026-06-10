import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { config } from "../config";
import { prisma } from "../shared/prisma";
import { logger } from "../shared/logger";
import { isEmailConfigured, sendTransactionalMail } from "../services/email";
import {
  buildResetPasswordEmailContent,
  buildVerifyEmailContent,
} from "../services/email/transactionalMail.templates";

const secret =
  config.betterAuthSecret ??
  (config.nodeEnv !== "production"
    ? "dev-better-auth-secret-min-32-characters-long!!"
    : undefined);

if (!secret) {
  throw new Error("Set BETTER_AUTH_SECRET (min 32 characters) for Better Auth.");
}

const baseURL = config.betterAuthUrl ?? config.clientUrl ?? `http://localhost:${config.port}`;

function buildTrustedOrigins(): string[] {
  const origins = new Set<string>(
    [
      config.clientUrl,
      baseURL,
      process.env.APP_URL,
      process.env.PROD_APP_URL,
      process.env.FRONTEND_URL,
      ...config.corsOrigins,
    ].filter((v): v is string => Boolean(v?.trim())),
  );
  return [...origins];
}

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
  trustedOrigins: buildTrustedOrigins(),

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
      const mail = buildResetPasswordEmailContent({
        recipientName: user.name ?? "there",
        resetUrl,
      });
      await safeSendMail(user.email, mail.subject, mail.html, mail.text);
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const verifyUrl = toFrontendUrl("/auth/verify-email", token);
      const mail = buildVerifyEmailContent({
        recipientName: user.name ?? "there",
        verifyUrl,
      });
      await safeSendMail(user.email, mail.subject, mail.html, mail.text);
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  advanced: {
    cookiePrefix: "better-auth",
    useSecureCookies: process.env.NODE_ENV === "production",
    crossSubDomainCookies: {
      enabled: false,
    },
    disableCSRFCheck: true,
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
