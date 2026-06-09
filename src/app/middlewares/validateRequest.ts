import type { Request, RequestHandler } from "express";
import { ZodError, type ZodTypeAny } from "zod";

import { ApiError } from "../errors/ApiError";
import { catchAsync } from "../shared/catchAsync";
import {
  buildFieldErrorList,
  buildFieldErrors,
  formatZodErrorMessage,
} from "../../utils/zodFormat";

type SchemaShape = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  cookies?: ZodTypeAny;
};

/** Parsed query/body/params after Zod validation (Express 5 query merge is unreliable). */
export type ValidatedRequest = Request & {
  validatedQuery?: unknown;
  validatedBody?: unknown;
  validatedParams?: unknown;
};

/** Use instead of `req.query` after {@link validateRequest} — Zod-coerced types are reliable. */
export function getValidatedQuery<T>(req: Request): T {
  const query = (req as ValidatedRequest).validatedQuery;
  if (query === undefined) {
    throw new ApiError(500, "Validated query is missing on this request", {
      code: "VALIDATED_QUERY_MISSING",
    });
  }
  return query as T;
}

/** Express 5 exposes `query` (and sometimes `body`) as read-only getters — merge instead of assign. */
function mergeValidated<T extends object>(target: T, parsed: unknown): void {
  if (typeof parsed === "object" && parsed !== null) {
    Object.assign(target, parsed as object);
  }
}

export function validateRequest(schemas: SchemaShape): RequestHandler {
  return catchAsync(async (req, _res, next) => {
    try {
      if (schemas.body !== undefined) {
        const parsed = await schemas.body.parseAsync(req.body);
        mergeValidated(
          req.body as Record<string, unknown>,
          parsed,
        );
      }
      if (schemas.query !== undefined) {
        const parsed = await schemas.query.parseAsync(req.query);
        (req as ValidatedRequest).validatedQuery = parsed;
        mergeValidated(
          req.query as Record<string, unknown>,
          parsed,
        );
      }
      if (schemas.params !== undefined) {
        const parsed = await schemas.params.parseAsync(req.params);
        mergeValidated(req.params as Record<string, unknown>, parsed);
      }
      if (schemas.cookies !== undefined) {
        const parsed = await schemas.cookies.parseAsync(req.cookies ?? {});
        mergeValidated(
          (req as Request & { cookies: Record<string, unknown> }).cookies,
          parsed,
        );
      }
      next();
    } catch (e: unknown) {
      if (e instanceof ZodError) {
        next(
          new ApiError(400, formatZodErrorMessage(e), {
            code: "VALIDATION_ERROR",
            details: {
              issues: e.issues,
              fieldErrors: buildFieldErrors(e),
              errors: buildFieldErrorList(e),
            },
          }),
        );
        return;
      }
      next(e);
    }
  });
}
