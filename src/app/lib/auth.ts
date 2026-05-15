import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { config } from "../config";
import { prisma } from "../shared/prisma";

const secret =
  config.betterAuthSecret ??
  (config.nodeEnv !== "production"
    ? "dev-better-auth-secret-min-32-characters-long!!"
    : undefined);

if (!secret) {
  throw new Error("Set BETTER_AUTH_SECRET (min 32 characters) for Better Auth.");
}

const baseURL =
  config.betterAuthUrl ?? `http://localhost:${config.port}`;

const googleEnabled =
  Boolean(config.googleClientId) && Boolean(config.googleClientSecret);

const githubEnabled =
  Boolean(config.githubClientId) && Boolean(config.githubClientSecret);

export const auth = betterAuth({
  appName: "Invoice",
  basePath: "/api/auth",
  secret,
  baseURL,
  trustedOrigins: [config.clientUrl, baseURL],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    modelName: "User",
    fields: {
      emailVerified: "isVerified",
      image: "avatar",
    },
  },
  emailAndPassword: {
    enabled: true,
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
