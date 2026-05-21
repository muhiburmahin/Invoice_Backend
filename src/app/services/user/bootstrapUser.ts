import { prisma } from "../../shared/prisma";
import { logger } from "../../shared/logger";

export type BootstrapUserInput = {
  id: string;
  email: string;
  name: string;
};

/**
 * Ensures every authenticated user has a Business profile and FREE subscription.
 * Idempotent — safe to call on every request until records exist.
 */
export async function ensureUserBootstrapped(user: BootstrapUserInput): Promise<void> {
  const [business, subscription] = await Promise.all([
    prisma.business.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.subscription.findUnique({ where: { userId: user.id }, select: { id: true } }),
  ]);

  if (business && subscription) return;

  const displayName = user.name?.trim() || user.email.split("@")[0] || "My Business";

  await prisma.$transaction(async (tx) => {
    if (!business) {
      await tx.business.create({
        data: {
          userId: user.id,
          name: displayName,
          email: user.email,
        },
      });
    }

    if (!subscription) {
      await tx.subscription.create({
        data: {
          userId: user.id,
        },
      });
    }
  });

  logger.debug("User bootstrapped", { userId: user.id });
}
