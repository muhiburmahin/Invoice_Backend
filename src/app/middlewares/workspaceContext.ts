import type { RequestHandler } from "express";

/**
 * Optional SaaS workspace / org scope from header.
 * Wire your tenant resolution + membership checks on top of this later.
 */
export const workspaceContext: RequestHandler = (req, _res, next) => {
  const raw = req.get("x-workspace-id") ?? req.get("X-Workspace-Id");
  if (raw && raw.trim()) {
    req.workspaceId = raw.trim();
  }
  next();
};
