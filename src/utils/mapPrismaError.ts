import { config } from "../app/config";

import { ApiError } from "../app/errors/ApiError";

type PrismaMeta = {
  modelName?: string;
  target?: string | string[];
  cause?: string;
};

function isPrismaKnownError(
  err: unknown,
): err is { code: string; meta?: PrismaMeta; message: string; name: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "PrismaClientKnownRequestError" &&
    typeof (err as { code?: unknown }).code === "string"
  );
}

function targetLabel(meta?: PrismaMeta): string {
  const t = meta?.target;
  if (Array.isArray(t)) return t.join(", ");
  if (typeof t === "string") return t;
  return "resource";
}


export function mapPrismaErrorToApiError(err: unknown): ApiError | null {
  if (!isPrismaKnownError(err)) return null;

  const meta = err.meta;

  switch (err.code) {
    case "P2002":
      return new ApiError(409, `Duplicate value for unique field(s): ${targetLabel(meta)}`, {
        code: "DUPLICATE_ENTRY",
        details: !config.isProduction ? { prismaCode: err.code, meta } : undefined,
      });
    case "P2003":
      return new ApiError(400, "Related record missing or invalid (foreign key)", {
        code: "FOREIGN_KEY_CONSTRAINT",
        details: !config.isProduction ? { prismaCode: err.code, meta } : undefined,
      });
    case "P2025":
      return new ApiError(404, "Record not found", {
        code: "NOT_FOUND",
      });
    case "P2014":
      return new ApiError(400, "Invalid relation: the change would violate data integrity", {
        code: "RELATION_VIOLATION",
      });
    case "P2004":
      return new ApiError(400, "A constraint failed on the database", {
        code: "CONSTRAINT_FAILED",
      });
    default:
      return new ApiError(
        500,
        !config.isProduction
          ? `[Prisma ${err.code}] ${err.message}`
          : "A database error occurred",
        {
          code: "DATABASE_ERROR",
          details: !config.isProduction ? { prismaCode: err.code, meta } : undefined,
        },
      );
  }
}
