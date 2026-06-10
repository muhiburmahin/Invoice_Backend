import type { Prisma } from "@prisma/client";

import { features } from "../../config/features";
import { prisma } from "../../shared/prisma";

export type AuditLogInput = {
  userId: string;
  action: string;
  invoiceId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

/** Persists activity when `FEATURE_AUDIT_LOG=true`. No-op otherwise. */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  if (!features.isAuditLogEnabled()) return;

  await prisma.activityLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      invoiceId: input.invoiceId,
      metadata: input.metadata,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}
