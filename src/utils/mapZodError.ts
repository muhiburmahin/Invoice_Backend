import { ZodError } from "zod";

import { ApiError } from "../app/errors/ApiError";

import { formatZodErrorMessage } from "./zodFormat";

/**
 * If `err` is a {@link ZodError}, returns a 400 {@link ApiError} with issues in `details`.
 */
export function mapZodErrorToApiError(err: unknown): ApiError | null {
  if (!(err instanceof ZodError)) return null;

  return new ApiError(400, formatZodErrorMessage(err), {
    code: "VALIDATION_ERROR",
    details: { issues: err.issues },
  });
}
