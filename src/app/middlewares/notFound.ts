import type { RequestHandler } from "express";

import { ApiError } from "../errors/ApiError";

/** 404 handler for invalid routes — forwards to {@link globalErrorHandler}. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(
    new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, {
      code: "NOT_FOUND",
    }),
  );
};
