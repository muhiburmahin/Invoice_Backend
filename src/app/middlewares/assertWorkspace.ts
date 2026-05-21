import type { RequestHandler } from "express";

import { ApiError } from "../errors/ApiError";
import { catchAsync } from "../shared/catchAsync";

/**
 * Single-tenant today: workspace id must match the authenticated user id.
 * Extend when you add Organization / team workspaces.
 */
export const assertWorkspace: RequestHandler = catchAsync(async (req, _res, next) => {
  const workspaceId = req.workspaceId;
  const userId = req.auth?.user?.id;

  if (!workspaceId) {
    next();
    return;
  }

  if (!userId) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }

  if (workspaceId !== userId) {
    throw new ApiError(403, "Workspace access denied", { code: "WORKSPACE_FORBIDDEN" });
  }

  next();
});
