import { ZodError } from "zod";

import { ApiError } from "../app/errors/ApiError";

import {
  buildFieldErrorList,
  buildFieldErrors,
  formatZodErrorMessage,
} from "./zodFormat";

export function mapZodErrorToApiError(err: unknown): ApiError | null {
  if (!(err instanceof ZodError)) return null;

  return new ApiError(400, formatZodErrorMessage(err), {
    code: "VALIDATION_ERROR",
    details: {
      issues: err.issues,
      fieldErrors: buildFieldErrors(err),
      errors: buildFieldErrorList(err),
    },
  });
}
