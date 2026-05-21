import { randomBytes } from "node:crypto";

import type { Request } from "express";

import type { Prisma } from "../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";
import { buildPaginationMeta } from "../../shared/pagination";
import {
  assertWithinPlanLimits,
  getUsageSnapshot,
} from "../../services/billing/planUsage.service";
import { getPlanLimits } from "../../constants/plans";
import { writeAuditLog } from "../../services/audit/auditLog.service";
import { getRequestIp } from "../auth/auth.helpers";

import { CLIENT_LIST_SELECT } from "./client.constants";
import type {
  CreateClientInput,
  ListClientsQuery,
  UpdateClientInput,
  UpdateClientStatusInput,
} from "./client.validation";

/* -------------------------------------------------------------------------- */
/*                               Shared helpers                               */
/* -------------------------------------------------------------------------- */

function normaliseNullable(v: string | null | undefined): string | null {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}

function generatePortalToken(): string {
  return randomBytes(32).toString("hex");
}

async function findOwnedClient(userId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, userId },
  });
  if (!client) {
    throw new ApiError(404, "Client not found", { code: "CLIENT_NOT_FOUND" });
  }
  return client;
}

async function assertUniqueClientEmail(
  userId: string,
  email: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.client.findFirst({
    where: {
      userId,
      email,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new ApiError(409, "A client with this email already exists", {
      code: "CLIENT_EMAIL_EXISTS",
    });
  }
}

async function findSoftDeletedByEmail(userId: string, email: string) {
  return prisma.client.findFirst({
    where: { userId, email, deletedAt: { not: null } },
  });
}

async function selectClientById(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: CLIENT_LIST_SELECT,
  });
  if (!client) {
    throw new ApiError(404, "Client not found", { code: "CLIENT_NOT_FOUND" });
  }
  return client;
}

function buildClientData(
  input: CreateClientInput | UpdateClientInput,
  options?: { forCreate?: boolean },
): Prisma.ClientCreateInput | Prisma.ClientUpdateInput {
  const data: Record<string, unknown> = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email;

  const nullableKeys = [
    "company",
    "address",
    "city",
    "state",
    "country",
    "zipCode",
    "taxNumber",
    "notes",
  ] as const;
  for (const key of nullableKeys) {
    if (input[key] !== undefined) {
      data[key] = normaliseNullable(input[key]);
    }
  }

  if (input.phone !== undefined) {
    data.phone = normaliseNullable(input.phone);
  }
  if (input.currency !== undefined) {
    data.currency = normaliseNullable(input.currency as string | null);
  }
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.portalEnabled !== undefined) {
    data.portalEnabled = input.portalEnabled;
    if (input.portalEnabled && options?.forCreate) {
      data.portalToken = generatePortalToken();
    }
  }

  return data as Prisma.ClientCreateInput | Prisma.ClientUpdateInput;
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                   */
/* -------------------------------------------------------------------------- */

export async function createClient(
  req: Request,
  userId: string,
  input: CreateClientInput,
) {
  await assertWithinPlanLimits(userId, "clients");

  // If a soft-deleted client with the same email exists, restore it instead of
  // hitting the DB-level @@unique([userId, email]) constraint.
  const softDeleted = await findSoftDeletedByEmail(userId, input.email);
  if (softDeleted) {
    const data = buildClientData(input) as Prisma.ClientUpdateInput;
    if (input.portalEnabled === true && !softDeleted.portalToken) {
      data.portalToken = generatePortalToken();
    }
    if (input.portalEnabled === false) {
      data.portalToken = null;
    }

    const restored = await prisma.client.update({
      where: { id: softDeleted.id },
      data: {
        ...data,
        deletedAt: null,
        isActive: true,
      },
      select: CLIENT_LIST_SELECT,
    });

    await writeAuditLog({
      userId,
      action: "client.restore_on_create",
      metadata: { clientId: restored.id, email: restored.email },
      ipAddress: getRequestIp(req),
      userAgent: req.get("user-agent") ?? undefined,
    });

    return { client: restored, restored: true };
  }

  await assertUniqueClientEmail(userId, input.email);

  const data = buildClientData(input, { forCreate: true }) as Prisma.ClientCreateInput;

  if (input.portalEnabled && !data.portalToken) {
    data.portalToken = generatePortalToken();
  }

  const client = await prisma.client.create({
    data: {
      ...data,
      user: { connect: { id: userId } },
    },
    select: CLIENT_LIST_SELECT,
  });

  await writeAuditLog({
    userId,
    action: "client.create",
    metadata: { clientId: client.id, email: client.email },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return { client, restored: false };
}

/* -------------------------------------------------------------------------- */
/*                                    List                                    */
/* -------------------------------------------------------------------------- */

export async function listClients(userId: string, query: ListClientsQuery) {
  const where: Prisma.ClientWhereInput = { userId };

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { company: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.status === "active") {
    where.isActive = true;
    where.deletedAt = null;
  } else if (query.status === "inactive") {
    where.isActive = false;
    where.deletedAt = null;
  } else if (query.status === "deleted") {
    where.deletedAt = { not: null };
  } else {
    // Default: hide soft-deleted clients from the main list.
    where.deletedAt = null;
  }
  if (query.tag) {
    where.tags = { has: query.tag.toLowerCase() };
  }

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip,
      take: query.limit,
      select: CLIENT_LIST_SELECT,
    }),
  ]);

  return {
    rows,
    meta: buildPaginationMeta(total, query),
  };
}

/* -------------------------------------------------------------------------- */
/*                              Summary stats                                 */
/* -------------------------------------------------------------------------- */

export async function getClientStats(userId: string) {
  const [usage, total, active, inactive, deleted, withPortal] =
    await Promise.all([
      getUsageSnapshot(userId),
      prisma.client.count({ where: { userId, deletedAt: null } }),
      prisma.client.count({
        where: { userId, isActive: true, deletedAt: null },
      }),
      prisma.client.count({
        where: { userId, isActive: false, deletedAt: null },
      }),
      prisma.client.count({ where: { userId, deletedAt: { not: null } } }),
      prisma.client.count({
        where: { userId, portalEnabled: true, deletedAt: null },
      }),
    ]);

  const limits = getPlanLimits(usage.plan);

  return {
    total,
    active,
    inactive,
    deleted,
    withPortal,
    plan: usage.plan,
    usage: {
      clients: usage.clients,
      limit: limits.maxClients,
      remaining:
        limits.maxClients === Number.POSITIVE_INFINITY
          ? null
          : Math.max(0, limits.maxClients - usage.clients),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Detail                                   */
/* -------------------------------------------------------------------------- */

export async function getClientDetail(userId: string, clientId: string) {
  const [client, invoiceStats] = await Promise.all([
    findOwnedClient(userId, clientId),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { userId, clientId, deletedAt: null },
      _count: { _all: true },
      _sum: { total: true, balanceDue: true },
    }),
  ]);

  const {
    portalToken: _token,
    ...safe
  } = client;

  const byStatus = invoiceStats.reduce<
    Record<string, { count: number; total: number; balanceDue: number }>
  >((acc, row) => {
    acc[row.status] = {
      count: row._count._all,
      total: row._sum.total ?? 0,
      balanceDue: row._sum.balanceDue ?? 0,
    };
    return acc;
  }, {});

  const invoiceCount = invoiceStats.reduce((n, r) => n + r._count._all, 0);
  const totalInvoiced = invoiceStats.reduce(
    (sum, r) => sum + (r._sum.total ?? 0),
    0,
  );
  const outstandingBalance = invoiceStats.reduce(
    (sum, r) => sum + (r._sum.balanceDue ?? 0),
    0,
  );

  return {
    client: safe,
    stats: {
      invoices: invoiceCount,
      totalInvoiced,
      outstandingBalance,
      byStatus,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Update                                   */
/* -------------------------------------------------------------------------- */

export async function updateClient(
  req: Request,
  userId: string,
  clientId: string,
  input: UpdateClientInput,
) {
  const current = await findOwnedClient(userId, clientId);

  if (current.deletedAt) {
    throw new ApiError(409, "Cannot update a deleted client", {
      code: "CLIENT_DELETED",
    });
  }

  if (input.email && input.email !== current.email) {
    await assertUniqueClientEmail(userId, input.email, clientId);
  }

  const data = buildClientData(input) as Prisma.ClientUpdateInput;

  // Enable portal → generate token if missing.
  if (input.portalEnabled === true && !current.portalToken) {
    data.portalToken = generatePortalToken();
  }
  // Disable portal → revoke token.
  if (input.portalEnabled === false) {
    data.portalToken = null;
  }

  if (Object.keys(data).length === 0) {
    return selectClientById(clientId);
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data,
    select: CLIENT_LIST_SELECT,
  });

  await writeAuditLog({
    userId,
    action: "client.update",
    metadata: { clientId, fields: Object.keys(data) },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return updated;
}

/* -------------------------------------------------------------------------- */
/*                              Activate / deactivate                         */
/* -------------------------------------------------------------------------- */

export async function updateClientStatus(
  req: Request,
  userId: string,
  clientId: string,
  input: UpdateClientStatusInput,
) {
  const current = await findOwnedClient(userId, clientId);

  if (current.deletedAt) {
    throw new ApiError(409, "Cannot change status of a deleted client", {
      code: "CLIENT_DELETED",
    });
  }
  if (current.isActive === input.isActive) {
    throw new ApiError(
      409,
      input.isActive ? "Client is already active" : "Client is already inactive",
      { code: "STATUS_UNCHANGED" },
    );
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { isActive: input.isActive },
    select: CLIENT_LIST_SELECT,
  });

  await writeAuditLog({
    userId,
    action: input.isActive ? "client.activate" : "client.deactivate",
    metadata: { clientId },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return updated;
}

export async function restoreClient(
  req: Request,
  userId: string,
  clientId: string,
) {
  const current = await findOwnedClient(userId, clientId);

  if (!current.deletedAt) {
    throw new ApiError(409, "Client is not deleted", {
      code: "CLIENT_NOT_DELETED",
    });
  }

  await assertWithinPlanLimits(userId, "clients");

  // Another active client may have taken this email while this one was deleted.
  await assertUniqueClientEmail(userId, current.email, clientId);

  const restored = await prisma.client.update({
    where: { id: clientId },
    data: {
      deletedAt: null,
      isActive: true,
    },
    select: CLIENT_LIST_SELECT,
  });

  await writeAuditLog({
    userId,
    action: "client.restore",
    metadata: { clientId, email: current.email },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return restored;
}

export async function regeneratePortalToken(
  req: Request,
  userId: string,
  clientId: string,
) {
  const current = await findOwnedClient(userId, clientId);

  if (current.deletedAt) {
    throw new ApiError(409, "Cannot regenerate portal token for a deleted client", {
      code: "CLIENT_DELETED",
    });
  }
  if (!current.portalEnabled) {
    throw new ApiError(400, "Client portal is not enabled", {
      code: "PORTAL_NOT_ENABLED",
    });
  }

  const portalToken = generatePortalToken();

  await prisma.client.update({
    where: { id: clientId },
    data: { portalToken },
  });

  await writeAuditLog({
    userId,
    action: "client.portal_token_regenerate",
    metadata: { clientId },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return { portalToken };
}

/* -------------------------------------------------------------------------- */
/*                               Soft delete                                  */
/* -------------------------------------------------------------------------- */

export async function deleteClient(
  req: Request,
  userId: string,
  clientId: string,
): Promise<void> {
  const current = await findOwnedClient(userId, clientId);

  if (current.deletedAt) {
    throw new ApiError(409, "Client is already deleted", {
      code: "CLIENT_ALREADY_DELETED",
    });
  }

  const activeRecurring = await prisma.recurringSchedule.count({
    where: { userId, clientId, isActive: true },
  });
  if (activeRecurring > 0) {
    throw new ApiError(
      409,
      "Cannot delete a client with active recurring schedules. Deactivate them first.",
      {
        code: "CLIENT_HAS_ACTIVE_RECURRING",
        details: { activeRecurring },
      },
    );
  }

  await prisma.client.update({
    where: { id: clientId },
    data: {
      deletedAt: new Date(),
      isActive: false,
      portalEnabled: false,
      portalToken: null,
    },
  });

  await writeAuditLog({
    userId,
    action: "client.delete",
    metadata: { clientId, email: current.email },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });
}
