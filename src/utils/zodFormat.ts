import type { ZodError } from "zod";

/** Human-readable single-line summary for API messages */
export function formatZodErrorMessage(err: ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "value"}: ${i.message}`)
    .join("; ");
}
