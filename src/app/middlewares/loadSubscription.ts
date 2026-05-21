import type { RequestHandler } from "express";

import { prisma } from "../shared/prisma";
import { catchAsync } from "../shared/catchAsync";

/** Attaches `req.subscription` after auth (and optional bootstrap). */
export const loadSubscription: RequestHandler = catchAsync(async (req, _res, next) => {
  const userId = req.auth?.user?.id;
  if (!userId) {
    next();
    return;
  }

  req.subscription =
    (await prisma.subscription.findUnique({ where: { userId } })) ?? undefined;

  next();
});
