import type { Request } from "express";

import type { Prisma } from "../../../generated/prisma/client";

/** Narrow alias — values we audit are always JSON-serialisable scalars. */
type AuditChangeValue = string | number | boolean | null;
type AuditChangeMap = Record<string, { from: AuditChangeValue; to: AuditChangeValue }>;
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";
import { writeAuditLog } from "../../services/audit/auditLog.service";
import { ensureUserBootstrapped } from "../../services/user/bootstrapUser";
import { getRequestIp } from "../auth/auth.helpers";

import { SUPPORTED_CURRENCIES } from "./business.constants";
import type { UpdateBusinessInput } from "./business.validation";

export async function getMyBusiness(userId: string) {
  let business = await prisma.business.findUnique({ where: { userId } });

  // Self-heal: a paranoia branch — middleware should have bootstrapped
  // already, but if something deleted the row we re-create it here so
  // every authenticated user always has a profile to view/edit.
  if (!business) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      throw new ApiError(404, "User not found", { code: "USER_NOT_FOUND" });
    }
    await ensureUserBootstrapped(user);
    business = await prisma.business.findUnique({ where: { userId } });
  }

  if (!business) {
    throw new ApiError(500, "Business profile could not be initialised", {
      code: "BUSINESS_BOOTSTRAP_FAILED",
    });
  }

  return business;
}
const AUDITED_FIELDS = [
  "currency",
  "taxRate",
  "invoicePrefix",
  "nextNumber",
] as const;

/** Convert "empty string ↔ null" so the DB column stays clean. */
function normaliseNullable(v: string | null | undefined): string | null {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}

export async function updateMyBusiness(
  req: Request,
  userId: string,
  input: UpdateBusinessInput,
) {
  const current = await getMyBusiness(userId);

  const data: Prisma.BusinessUpdateInput = {};
  const changes: AuditChangeMap = {};

  // Required-ish string fields
  if (input.name !== undefined && input.name !== current.name) {
    data.name = input.name;
    changes.name = { from: current.name, to: input.name };
  }

  // Nullable URL / contact fields
  const nullableFields: Array<keyof UpdateBusinessInput> = [
    "logo",
    "email",
    "phone",
    "website",
    "address",
    "city",
    "state",
    "country",
    "zipCode",
    "taxNumber",
    "vatNumber",
    "defaultNotes",
    "defaultTerms",
    "primaryColor",
    "accentColor",
  ];
  for (const key of nullableFields) {
    if (input[key] === undefined) continue;
    const next = normaliseNullable(input[key] as string | null | undefined);
    const prev =
      ((current as unknown as Record<string, AuditChangeValue>)[key] ?? null);
    if (next !== prev) {
      (data as Record<string, unknown>)[key] = next;
      changes[key] = { from: prev, to: next };
    }
  }

  // Enum / number fields
  if (input.currency !== undefined && input.currency !== current.currency) {
    data.currency = input.currency;
    changes.currency = { from: current.currency, to: input.currency };
  }
  if (input.taxRate !== undefined && input.taxRate !== current.taxRate) {
    data.taxRate = input.taxRate;
    changes.taxRate = { from: current.taxRate, to: input.taxRate };
  }
  if (
    input.invoicePrefix !== undefined &&
    input.invoicePrefix !== current.invoicePrefix
  ) {
    data.invoicePrefix = input.invoicePrefix;
    changes.invoicePrefix = {
      from: current.invoicePrefix,
      to: input.invoicePrefix,
    };
  }
  if (
    input.defaultDueDays !== undefined &&
    input.defaultDueDays !== current.defaultDueDays
  ) {
    data.defaultDueDays = input.defaultDueDays;
    changes.defaultDueDays = {
      from: current.defaultDueDays,
      to: input.defaultDueDays,
    };
  }

  // nextNumber — never allow going backwards (would clash with existing invoices)
  if (input.nextNumber !== undefined && input.nextNumber !== current.nextNumber) {
    if (input.nextNumber < current.nextNumber) {
      throw new ApiError(
        409,
        `Next invoice number cannot be lower than the current value (${current.nextNumber})`,
        {
          code: "INVOICE_NUMBER_DECREASE_NOT_ALLOWED",
          details: { current: current.nextNumber, attempted: input.nextNumber },
        },
      );
    }
    data.nextNumber = input.nextNumber;
    changes.nextNumber = {
      from: current.nextNumber,
      to: input.nextNumber,
    };
  }

  if (Object.keys(data).length === 0) {
    return current; // nothing actually changed
  }

  const updated = await prisma.business.update({
    where: { userId },
    data,
  });

  // Audit-log only when one of the "important" fields changed.
  const importantChanges: AuditChangeMap = Object.fromEntries(
    Object.entries(changes).filter(([k]) =>
      (AUDITED_FIELDS as readonly string[]).includes(k),
    ),
  );
  if (Object.keys(importantChanges).length > 0) {
    await writeAuditLog({
      userId,
      action: "business.update",
      metadata: importantChanges as unknown as Prisma.InputJsonValue,
      ipAddress: getRequestIp(req),
      userAgent: req.get("user-agent") ?? undefined,
    });
  }

  return updated;
}

export async function getBrandingPreview(userId: string) {
  const business = await getMyBusiness(userId);
  return {
    name: business.name,
    logo: business.logo,
    primaryColor: business.primaryColor,
    accentColor: business.accentColor,
    currency: business.currency,
    invoicePrefix: business.invoicePrefix,
    nextNumber: business.nextNumber,
  };
}


export function listSupportedCurrencies() {
  return SUPPORTED_CURRENCIES.map((c) => ({ ...c }));
}
