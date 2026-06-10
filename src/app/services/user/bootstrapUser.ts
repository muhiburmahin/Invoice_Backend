import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma";
import { logger } from "../../shared/logger";

export type BootstrapUserInput = {
  id: string;
  email: string;
  name: string;
};

/**
 * Ensures every authenticated user has a Business profile and FREE subscription.
 *
 * Uses Prisma `upsert` (instead of find-then-create) so two concurrent requests
 * for the same brand-new user (e.g. signup + Better Auth's `create.after` hook)
 * cannot both win the race and trigger a P2002 unique constraint violation.
 *
 * Safe to call on every authenticated request — `upsert` short-circuits when
 * the row already exists.
 */
export async function ensureUserBootstrapped(
  user: BootstrapUserInput,
): Promise<void> {
  const displayName =
    user.name?.trim() || user.email.split("@")[0] || "My Business";

  try {
    await prisma.$transaction([
      prisma.business.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          name: displayName,
          email: user.email,
        },
      }),
      prisma.subscription.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      }),
    ]);
  } catch (e) {
    // Tolerate concurrent winners — the other request created the row first.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      logger.debug("Bootstrap race detected; the row was already created", {
        userId: user.id,
      });
      return;
    }
    throw e;
  }

  logger.debug("User bootstrapped", { userId: user.id });
}
