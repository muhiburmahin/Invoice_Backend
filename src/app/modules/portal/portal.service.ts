import type { Prisma } from "@prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";
import { buildPaginationMeta } from "../../shared/pagination";
import {
  buildInvoicePdfFilename,
  buildInvoicePrintData,
  enrichClientAddress,
  generateInvoicePdfBuffer,
} from "../../services/pdf/invoicePdf.service";

import {
  PORTAL_INVOICE_LIST_SELECT,
  PORTAL_VISIBLE_STATUSES,
} from "./portal.constants";
import {
  buildPortalUrl,
  findPortalInvoice,
  markInvoiceViewedFromPortal,
  resolvePortalClient,
} from "./portal.helpers";
import type { ListPortalInvoicesQuery, PortalCheckoutInput } from "./portal.validation";
import { createInvoiceStripeCheckout, getStripeCheckoutMeta } from "../../services/billing/stripeCheckout.service";

export async function getPortalMeta(token: string) {
  const client = await resolvePortalClient(token);
  const stripe = getStripeCheckoutMeta();

  return {
    client: {
      name: client.name,
      email: client.email,
      company: client.company,
    },
    business: client.user.business,
    visibleStatuses: PORTAL_VISIBLE_STATUSES,
    payments: {
      stripeCheckoutAvailable: stripe.checkoutAvailable,
    },
  };
}

export async function listPortalInvoices(
  token: string,
  query: ListPortalInvoicesQuery,
) {
  const client = await resolvePortalClient(token);

  if (query.status && !PORTAL_VISIBLE_STATUSES.includes(query.status)) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  const where: Prisma.InvoiceWhereInput = {
    userId: client.userId,
    clientId: client.id,
    deletedAt: null,
    status: query.status ?? { in: [...PORTAL_VISIBLE_STATUSES] },
  };

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip,
      take: query.limit,
      select: PORTAL_INVOICE_LIST_SELECT,
    }),
  ]);

  return { rows, meta: buildPaginationMeta(total, query) };
}

export async function getPortalInvoiceDetail(token: string, invoiceId: string) {
  const client = await resolvePortalClient(token);
  const invoice = await findPortalInvoice(client.id, client.userId, invoiceId);

  if (!PORTAL_VISIBLE_STATUSES.includes(invoice.status)) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  if (invoice.status === "SENT") {
    await markInvoiceViewedFromPortal({
      invoiceId,
      userId: client.userId,
      clientId: client.id,
      clientName: client.name,
      invoiceNumber: invoice.number,
      currentStatus: invoice.status,
      via: "portal",
    });
    invoice.status = "VIEWED";
    invoice.viewedAt = new Date();
  }

  const paymentSummary = await prisma.payment.groupBy({
    by: ["status"],
    where: { invoiceId },
    _count: { _all: true },
    _sum: { amount: true },
  });

  const payments = paymentSummary.reduce<
    Record<string, { count: number; amount: number }>
  >((acc, row) => {
    acc[row.status] = {
      count: row._count._all,
      amount: row._sum.amount ?? 0,
    };
    return acc;
  }, {});

  const paymentTotal = paymentSummary
    .filter((row) => row.status === "COMPLETED")
    .reduce((sum, row) => sum + (row._sum.amount ?? 0), 0);

  return {
    invoice,
    payments,
    paymentTotal,
    business: client.user.business,
  };
}

export async function downloadPortalInvoicePdf(
  token: string,
  invoiceId: string,
) {
  const client = await resolvePortalClient(token);
  const invoice = await findPortalInvoice(client.id, client.userId, invoiceId);

  if (!PORTAL_VISIBLE_STATUSES.includes(invoice.status)) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  let data = await buildInvoicePrintData(client.userId, invoiceId);
  data = await enrichClientAddress(data, client.id);

  const buffer = await generateInvoicePdfBuffer(data);

  if (invoice.status === "SENT") {
    await markInvoiceViewedFromPortal({
      invoiceId,
      userId: client.userId,
      clientId: client.id,
      clientName: client.name,
      invoiceNumber: invoice.number,
      currentStatus: invoice.status,
      via: "portal_pdf",
    });
  }

  return {
    buffer,
    filename: buildInvoicePdfFilename(invoice.number),
  };
}

export async function createPortalInvoiceCheckout(
  token: string,
  invoiceId: string,
  input: PortalCheckoutInput = {},
) {
  const client = await resolvePortalClient(token);
  const invoice = await findPortalInvoice(client.id, client.userId, invoiceId);

  if (!PORTAL_VISIBLE_STATUSES.includes(invoice.status)) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  const portalBase = buildPortalUrl(token);
  const invoicePath = `${portalBase}/invoices/${invoiceId}`;

  return createInvoiceStripeCheckout({
    userId: client.userId,
    invoiceId,
    amount: input.amount,
    customerEmail: client.email,
    successUrl: `${invoicePath}?payment=success`,
    cancelUrl: `${invoicePath}?payment=cancelled`,
  });
}
