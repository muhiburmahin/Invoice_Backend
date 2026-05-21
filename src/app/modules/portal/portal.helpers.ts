import { ApiError } from "../../errors/ApiError";
import { config } from "../../config";
import { prisma } from "../../shared/prisma";
import { writeAuditLog } from "../../services/audit/auditLog.service";
import { notifyInvoiceViewed } from "../../services/notification";

import {
  PORTAL_BUSINESS_SELECT,
  PORTAL_CLIENT_SELECT,
} from "./portal.constants";

export async function resolvePortalClient(token: string) {
  const client = await prisma.client.findFirst({
    where: {
      portalToken: token,
      portalEnabled: true,
      deletedAt: null,
      isActive: true,
    },
    select: {
      ...PORTAL_CLIENT_SELECT,
      user: {
        select: {
          id: true,
          business: { select: PORTAL_BUSINESS_SELECT },
        },
      },
    },
  });

  if (!client || !client.user.business) {
    throw new ApiError(404, "Invalid or expired portal link", {
      code: "PORTAL_INVALID",
    });
  }

  return client;
}

export async function findPortalInvoice(
  clientId: string,
  userId: string,
  invoiceId: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      clientId,
      userId,
      deletedAt: null,
    },
    include: {
      items: { orderBy: { order: "asc" } },
    },
  });

  if (!invoice) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  return invoice;
}

export function buildPortalUrl(token: string): string {
  const base = config.clientUrl.replace(/\/$/, "");
  return `${base}/portal/${token}`;
}

export async function getClientPortalLink(
  userId: string,
  clientId: string,
): Promise<string | null> {
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      userId,
      portalEnabled: true,
      deletedAt: null,
      isActive: true,
    },
    select: { portalToken: true },
  });
  if (!client?.portalToken) return null;
  return buildPortalUrl(client.portalToken);
}

export async function markInvoiceViewedFromPortal(input: {
  invoiceId: string;
  userId: string;
  clientId: string;
  clientName: string;
  invoiceNumber: string;
  currentStatus: string;
  via: "portal" | "portal_pdf";
}): Promise<boolean> {
  if (input.currentStatus !== "SENT") return false;

  await prisma.invoice.update({
    where: { id: input.invoiceId },
    data: { status: "VIEWED", viewedAt: new Date() },
  });

  await writeAuditLog({
    userId: input.userId,
    action: "invoice.portal_view",
    invoiceId: input.invoiceId,
    metadata: {
      clientId: input.clientId,
      number: input.invoiceNumber,
      via: input.via,
    },
  });

  await notifyInvoiceViewed({
    userId: input.userId,
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    clientName: input.clientName,
    via: input.via,
  });

  return true;
}
