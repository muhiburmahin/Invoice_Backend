import type { InvoiceStatus } from "@prisma/client";

export const PORTAL_ROUTES = {
  meta: "/:token/meta",
  invoices: "/:token/invoices",
  invoiceById: "/:token/invoices/:invoiceId",
  invoicePdf: "/:token/invoices/:invoiceId/pdf",
  invoiceCheckout: "/:token/invoices/:invoiceId/checkout",
} as const;

/** Invoice statuses visible to clients in the portal. */
export const PORTAL_VISIBLE_STATUSES: InvoiceStatus[] = [
  "SENT",
  "VIEWED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "REFUNDED",
];

export const PORTAL_INVOICE_LIST_SELECT = {
  id: true,
  number: true,
  status: true,
  issueDate: true,
  dueDate: true,
  total: true,
  paidAmount: true,
  balanceDue: true,
  currency: true,
  viewedAt: true,
  sentAt: true,
  createdAt: true,
} as const;

export const PORTAL_BUSINESS_SELECT = {
  name: true,
  logo: true,
  email: true,
  phone: true,
  website: true,
  primaryColor: true,
  accentColor: true,
  currency: true,
} as const;

export const PORTAL_CLIENT_SELECT = {
  id: true,
  name: true,
  email: true,
  company: true,
  userId: true,
} as const;
