import type { AuthSessionPayload } from "../app/lib/auth-session";

declare global {
  namespace Express {
    interface Request {
      /** From {@link requestIdMiddleware} */
      requestId?: string;
      /** Set by {@link requireAuth} / {@link optionalAuth} when session is present */
      auth?: AuthSessionPayload;
    }
  }
}

export {};
