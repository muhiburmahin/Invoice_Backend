import type { Request, RequestHandler } from "express";
import { ZodError, type ZodTypeAny } from "zod";

import { ApiError } from "../errors/ApiError";
import { catchAsync } from "../shared/catchAsync";
import { formatZodErrorMessage } from "../../utils/zodFormat";

type SchemaShape = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  cookies?: ZodTypeAny;
};

export function validateRequest(schemas: SchemaShape): RequestHandler {
  return catchAsync(async (req, _res, next) => {
    try {
      if (schemas.body !== undefined) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query !== undefined) {
        req.query = (await schemas.query.parseAsync(
          req.query,
        )) as typeof req.query;
      }
      if (schemas.params !== undefined) {
        const parsed = await schemas.params.parseAsync(req.params);
        if (typeof parsed === "object" && parsed !== null) {
          Object.assign(req.params, parsed as object);
        }
      }
      if (schemas.cookies !== undefined) {
        (req as Request & { cookies: Record<string, unknown> }).cookies =
          (await schemas.cookies.parseAsync(req.cookies ?? {})) as Record<
            string,
            unknown
          >;
      }
      next();
    } catch (e: unknown) {
      if (e instanceof ZodError) {
        next(
          new ApiError(400, formatZodErrorMessage(e), {
            code: "VALIDATION_ERROR",
            details: { issues: e.issues },
          }),
        );
        return;
      }
      next(e);
    }
  });
}
