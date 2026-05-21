import type { ZodError, ZodIssue } from "zod";

/** Human-readable single-line summary for API messages */
export function formatZodErrorMessage(err: ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "value"}: ${i.message}`)
    .join("; ");
}

export type FieldErrors = Record<string, string[]>;

/**
 * Groups Zod issues by field for frontend toast/inline display.
 * Frontend: `Object.entries(fieldErrors).forEach(([field, msgs]) => msgs.forEach(toast.error))`.
 */
export function buildFieldErrors(err: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    if (!out[key]) out[key] = [];
    out[key].push(issue.message);
  }
  return out;
}

/** Flat list of `field: message` strings — easy to map to individual toasts. */
export function buildFieldErrorList(err: ZodError): string[] {
  return err.issues.map(
    (i: ZodIssue) => `${i.path.join(".") || "value"}: ${i.message}`,
  );
}
