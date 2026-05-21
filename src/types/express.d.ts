import type { AuthSessionPayload } from "../app/lib/auth-session";
import type { Subscription, UserRole } from "../generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      /** From {@link requestId} middleware */
      requestId?: string;
      /** Set by {@link requireAuth} / {@link optionalAuth} when session is present */
      auth?: AuthSessionPayload;
      /** Loaded by {@link loadSubscription} on protected routes */
      subscription?: Subscription;
      /** Optional SaaS workspace / org id (`X-Workspace-Id`) */
      workspaceId?: string;
      /** Resolved by {@link requireRole} — the user's database role */
      userRole?: UserRole;
    }
  }
}

export {};
