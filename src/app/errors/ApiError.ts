/** Operational HTTP errors — handled by {@link globalErrorHandler} with a stable status. */
export class ApiError extends Error {
  readonly statusCode: number;

  readonly code?: string;

  readonly isOperational: boolean;

  /** Extra payload (e.g. validation issues) — only in API response when safe. */
  readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string; isOperational?: boolean; details?: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = options?.code;
    this.isOperational = options?.isOperational ?? true;
    this.details = options?.details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
