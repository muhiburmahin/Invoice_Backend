import type { Response } from "express";

import type { IErrorResponse, ISuccessResponse } from "../interfaces/error";

export type { IErrorResponse, ISuccessResponse };

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
): Response {
  const body: ISuccessResponse<T> = meta
    ? { success: true, data, meta }
    : { success: true, data };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  options?: {
    code?: string;
    details?: unknown;
    requestId?: string;
    errorRef?: string;
    /** @default true */
    includeTimestamp?: boolean;
  },
): Response {
  const includeTimestamp = options?.includeTimestamp !== false;
  const body: IErrorResponse = {
    success: false,
    message,
    ...(includeTimestamp && { timestamp: new Date().toISOString() }),
    ...(options?.code && { code: options.code }),
    ...(options?.details !== undefined && { details: options.details }),
    ...(options?.requestId && { requestId: options.requestId }),
    ...(options?.errorRef && { errorRef: options.errorRef }),
  };
  return res.status(statusCode).json(body);
}
