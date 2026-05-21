import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";
import { getPlanLimits } from "../../constants/plans";
import { getUsageSnapshot } from "../billing/planUsage.service";
import { getMyBusiness } from "../../modules/business/business.service";
import { findOwnedInvoice } from "../../modules/invoice/invoice.helpers";

import { createInvoicePdfDocument } from "./InvoicePdfDocument";
import type { InvoicePrintData } from "./invoicePdf.types";

export async function buildInvoicePrintData(
  userId: string,
  invoiceId: string,
): Promise<InvoicePrintData> {
  const [invoice, business] = await Promise.all([
    findOwnedInvoice(userId, invoiceId),
    getMyBusiness(userId),
  ]);

  if (invoice.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  return {
    business: {
      name: business.name,
      email: business.email,
      phone: business.phone,
      website: business.website,
      address: business.address,
      city: business.city,
      state: business.state,
      country: business.country,
      zipCode: business.zipCode,
      taxNumber: business.taxNumber,
      logo: business.logo,
      primaryColor: business.primaryColor,
    },
    client: {
      name: invoice.client.name,
      email: invoice.client.email,
      company: invoice.client.company,
      address: null,
      city: null,
      state: null,
      country: null,
      zipCode: null,
    },
    invoice: {
      number: invoice.number,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      taxRate: invoice.taxRate,
      taxAmount: invoice.taxAmount,
      discount: invoice.discount,
      discountType: invoice.discountType,
      total: invoice.total,
      paidAmount: invoice.paidAmount,
      balanceDue: invoice.balanceDue,
      notes: invoice.notes,
      terms: invoice.terms,
      footer: invoice.footer,
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount,
        unit: item.unit,
        taxable: item.taxable,
      })),
    },
  };
}

/** Load full client address for PDF/email when available. */
export async function enrichClientAddress(
  data: InvoicePrintData,
  clientId: string,
): Promise<InvoicePrintData> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      address: true,
      city: true,
      state: true,
      country: true,
      zipCode: true,
    },
  });
  if (!client) return data;

  return {
    ...data,
    client: {
      ...data.client,
      address: client.address,
      city: client.city,
      state: client.state,
      country: client.country,
      zipCode: client.zipCode,
    },
  };
}

export async function assertPdfExportAllowed(userId: string): Promise<void> {
  const usage = await getUsageSnapshot(userId);
  const limits = getPlanLimits(usage.plan);
  if (!limits.pdfExport) {
    throw new ApiError(403, "PDF export is not available on your plan", {
      code: "PLAN_FEATURE_UNAVAILABLE",
      details: { plan: usage.plan },
    });
  }
}

export async function generateInvoicePdfBuffer(
  data: InvoicePrintData,
): Promise<Buffer> {
  return renderToBuffer(
    createInvoicePdfDocument(data) as React.ReactElement<DocumentProps>,
  );
}

export function buildInvoicePdfFilename(number: string): string {
  const safe = number.replace(/[^\w.-]+/g, "-");
  return `invoice-${safe}.pdf`;
}

export async function getInvoicePdfAsset(
  userId: string,
  invoiceId: string,
): Promise<{ buffer: Buffer; filename: string; data: InvoicePrintData }> {
  await assertPdfExportAllowed(userId);

  const invoice = await findOwnedInvoice(userId, invoiceId);
  if (invoice.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  let data = await buildInvoicePrintData(userId, invoiceId);
  data = await enrichClientAddress(data, invoice.clientId);

  const buffer = await generateInvoicePdfBuffer(data);
  return {
    buffer,
    filename: buildInvoicePdfFilename(data.invoice.number),
    data,
  };
}
