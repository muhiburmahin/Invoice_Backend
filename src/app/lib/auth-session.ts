import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";

import { auth } from "./auth";

export type AuthSessionPayload = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/** Resolve Better Auth session from Express request cookies / headers. */
export function getSession(req: Request) {
  return auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
}
