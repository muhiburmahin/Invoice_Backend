import type { RequestHandler } from "express";

import { getSession } from "../lib/auth-session";
import { ApiError } from "../errors/ApiError";
import { catchAsync } from "../shared/catchAsync";

export const requireAuth = catchAsync(async (req, _res, next) => {
  const payload = await getSession(req);
  if (!payload?.user) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }
  req.auth = payload;
  next();
}) as RequestHandler;

export const optionalAuth = catchAsync(async (req, _res, next) => {
  const payload = await getSession(req);
  if (payload?.user) {
    req.auth = payload;
  }
  next();
}) as RequestHandler;
