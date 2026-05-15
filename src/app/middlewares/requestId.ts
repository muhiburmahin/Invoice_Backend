import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

/** Propagates or generates `X-Request-Id` for tracing. */
export const requestId: RequestHandler = (req, res, next) => {
  const id = req.get("x-request-id") ?? randomUUID();
  res.setHeader("X-Request-Id", id);
  req.requestId = id;
  next();
};
