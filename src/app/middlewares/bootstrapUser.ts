import type { RequestHandler } from "express";

import { ensureUserBootstrapped } from "../services/user/bootstrapUser";
import { catchAsync } from "../shared/catchAsync";

/** Runs after {@link requireAuth} — creates Business + Subscription on first login. */
export const bootstrapUser: RequestHandler = catchAsync(async (req, _res, next) => {
  const user = req.auth?.user;
  if (!user?.id || !user.email) {
    next();
    return;
  }

  await ensureUserBootstrapped({
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
  });

  next();
});
