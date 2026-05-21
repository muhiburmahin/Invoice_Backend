import type { RequestHandler } from "express";

import { ApiError } from "../errors/ApiError";
import { prisma } from "../shared/prisma";
import { catchAsync } from "../shared/catchAsync";

/** Blocks deactivated or soft-deleted accounts. */
export const requireActiveUser: RequestHandler = catchAsync(async (req, _res, next) => {
  const userId = req.auth?.user?.id;
  if (!userId) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, deletedAt: true },
  });

  if (!user || !user.isActive || user.deletedAt) {
    throw new ApiError(403, "Account is not active", { code: "ACCOUNT_INACTIVE" });
  }

  next();
});
