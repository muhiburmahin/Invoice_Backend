import type { NextFunction, Request, Response } from "express";

import { config } from "../config";
import { ApiError } from "../errors/ApiError";
import { logger } from "../shared/logger";
import { sendError } from "../shared/sendResponse";
import { generateErrorRef } from "../../utils/errorRef";
import { mapPrismaErrorToApiError } from "../../utils/mapPrismaError";
import { mapZodErrorToApiError } from "../../utils/mapZodError";

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId;

  if (err instanceof ApiError && err.isOperational) {
    sendError(res, err.statusCode, err.message, {
      code: err.code,
      details: err.details,
      requestId,
    });
    return;
  }

  if (err instanceof ApiError && !err.isOperational) {
    const errorRef = generateErrorRef();
    logger.error("Non-operational ApiError", {
      requestId,
      errorRef,
      message: err.message,
      stack: err.stack,
      details: err.details,
    });
    sendError(res, err.statusCode, err.message, {
      code: err.code ?? "INTERNAL_ERROR",
      requestId,
      errorRef,
      details: config.isProduction ? undefined : err.details,
    });
    return;
  }

  const fromZod = mapZodErrorToApiError(err);
  if (fromZod) {
    sendError(res, fromZod.statusCode, fromZod.message, {
      code: fromZod.code,
      details: fromZod.details,
      requestId,
    });
    return;
  }

  const fromPrisma = mapPrismaErrorToApiError(err);
  if (fromPrisma) {
    if (fromPrisma.statusCode >= 500) {
      const errorRef = generateErrorRef();
      logger.error("Prisma database error", {
        requestId,
        errorRef,
        message: fromPrisma.message,
        code: fromPrisma.code,
      });
      sendError(res, fromPrisma.statusCode, fromPrisma.message, {
        code: fromPrisma.code,
        details: config.isProduction ? undefined : fromPrisma.details,
        requestId,
        errorRef,
      });
      return;
    }

    sendError(res, fromPrisma.statusCode, fromPrisma.message, {
      code: fromPrisma.code,
      details: fromPrisma.details,
      requestId,
    });
    return;
  }

  const errorRef = generateErrorRef();
  logger.error("Unhandled error", {
    requestId,
    errorRef,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  if (config.isProduction) {
    sendError(res, 500, "Internal server error", {
      code: "INTERNAL_ERROR",
      requestId,
      errorRef,
    });
    return;
  }

  sendError(res, 500, err instanceof Error ? err.message : "Internal server error", {
    code: "INTERNAL_ERROR",
    requestId,
    errorRef,
    details: err instanceof Error ? err.stack : String(err),
  });
}
