import { randomBytes } from "node:crypto";

/** Short opaque id for log ↔ API error correlation (not a secret). */
export function generateErrorRef(): string {
  return randomBytes(6).toString("hex");
}
