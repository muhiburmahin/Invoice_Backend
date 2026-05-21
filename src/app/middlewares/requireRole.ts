import type { RequestHandler } from "express";

import type { UserRole } from "../../generated/prisma/client";
import { ApiError } from "../errors/ApiError";
import { prisma } from "../shared/prisma";
import { catchAsync } from "../shared/catchAsync";

/**
 * Restricts a route to one or more roles. Mount AFTER {@link requireAuth}.
 *
 * @example
 *   router.get("/users", requireAuth, requireRole("SUPER_ADMIN"), handler);
 *   router.get("/audit", requireAuth, requireRole("SUPPORT", "SUPER_ADMIN"), handler);
 */
export function requireRole(...allowed: UserRole[]): RequestHandler {
  return catchAsync(async (req, _res, next) => {
    const userId = req.auth?.user?.id;
    if (!userId) {
      throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true, deletedAt: true },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new ApiError(403, "Account is not active", { code: "ACCOUNT_INACTIVE" });
    }

    if (!allowed.includes(user.role)) {
      throw new ApiError(403, "You do not have permission to access this resource", {
        code: "FORBIDDEN_ROLE",
        details: { requiredRoles: allowed, yourRole: user.role },
      });
    }

    req.userRole = user.role;
    next();
  });
}

/** Returns true for SUPER_ADMIN, false otherwise. Handy in service code paths. */
export function isSuperAdmin(role: UserRole | undefined | null): boolean {
  return role === "SUPER_ADMIN";
}

/** Returns true for SUPPORT or higher. */
export function isStaff(role: UserRole | undefined | null): boolean {
  return role === "SUPPORT" || role === "SUPER_ADMIN";
}
