import type { Request } from "express";
import { startOfMonth } from "date-fns";

import type {
  DiscountType,
  InvoiceStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";
import { buildPaginationMeta } from "../../shared/pagination";
import {
  assertWithinPlanLimits,
  getUsageSnapshot,
} from "../../services/billing/planUsage.service";
import { getPlanLimits } from "../../constants/plans";
import { writeAuditLog } from "../../services/audit/auditLog.service";
import { notifyReminderSent } from "../../services/notification";
import { sendInvoiceEmail } from "../../services/email/invoiceMail.service";
import { isEmailConfigured } from "../../services/email/smtp.service";
import { getInvoicePdfAsset } from "../../services/pdf/invoicePdf.service";
import { getRequestIp } from "../auth/auth.helpers";
import { getMyBusiness } from "../business/business.service";

import {
  ALLOWED_STATUS_TRANSITIONS,
  DELETABLE_STATUSES,
  EDITABLE_STATUSES,
  INVOICE_LIST_SELECT,
  INVOICE_STATUSES,
  REMINDABLE_STATUSES,
  RESENDABLE_STATUSES,
  SENDABLE_STATUSES,
} from "./invoice.constants";
import {
  allocateInvoiceNumber,
  assertClientBillable,
  assertDeletableStatus,
  assertEditableStatus,
  assertSendableInvoice,
  assertStatusTransition,
  calculateTotals,
  createInvoiceFromTemplateInTransaction,
  findOwnedInvoice,
  roundMoney,
} from "./invoice.helpers";
import { assertRecurringScheduleLink } from "../recurring/recurring.helpers";
import { getClientPortalLink } from "../portal/portal.helpers";
import type {
  CreateInvoiceInput,
  ListInvoicesQuery,
  RemindInvoiceInput,
  SendInvoiceInput,
  UpdateInvoiceInput,
  UpdateInvoiceStatusInput,
} from "./invoice.validation";

/* -------------------------------------------------------------------------- */
/*                               Shared helpers                               */
/* -------------------------------------------------------------------------- */

function normaliseNullable(v: string | null | undefined): string | null {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}

function assertInvoiceSendable(status: InvoiceStatus): void {
  const allowed = [...SENDABLE_STATUSES, ...RESENDABLE_STATUSES];
  if (!allowed.includes(status)) {
    throw new ApiError(
      409,
      `Invoice in ${status} status cannot be sent`,
      {
        code: "INVOICE_NOT_SENDABLE",
        details: { status, allowed },
      },
    );
  }
}

function assertInvoiceRemindable(status: InvoiceStatus): void {
  if (!REMINDABLE_STATUSES.includes(status)) {
    throw new ApiError(
      409,
      `Payment reminders cannot be sent for a ${status} invoice`,
      {
        code: "INVOICE_NOT_REMINDABLE",
        details: { status, allowed: REMINDABLE_STATUSES },
      },
    );
  }
}

function resolveDueDate(
  issueDate: Date,
  dueDate: Date | undefined,
  defaultDueDays: number,
): Date {
  if (dueDate) return dueDate;
  const resolved = new Date(issueDate);
  resolved.setDate(resolved.getDate() + defaultDueDays);
  return resolved;
}

function assertDateOrder(issueDate: Date, dueDate: Date): void {
  if (dueDate.getTime() < issueDate.getTime()) {
    throw new ApiError(409, "Due date cannot be before the issue date", {
      code: "INVALID_DUE_DATE",
    });
  }
}

function resolveStatusSideEffects(
  to: InvoiceStatus,
  invoice: { total: number; paidAmount: number },
  input?: UpdateInvoiceStatusInput,
): Prisma.InvoiceUpdateInput {
  const data: Prisma.InvoiceUpdateInput = { status: to };
  const now = new Date();

  switch (to) {
    case "SENT":
      data.sentAt = now;
      break;
    case "VIEWED":
      data.viewedAt = now;
      break;
    case "PAID":
      data.paidAmount = invoice.total;
      data.balanceDue = 0;
      break;
    case "PARTIALLY_PAID": {
      const paid = input?.paidAmount;
      if (paid === undefined || paid <= 0 || paid >= invoice.total) {
        throw new ApiError(
          400,
          "Paid amount must be greater than 0 and less than the invoice total",
          { code: "INVALID_PAID_AMOUNT" },
        );
      }
      data.paidAmount = roundMoney(paid);
      data.balanceDue = roundMoney(invoice.total - paid);
      break;
    }
    case "REFUNDED":
      data.paidAmount = 0;
      data.balanceDue = invoice.total;
      break;
    case "DRAFT":
      data.sentAt = null;
      data.viewedAt = null;
      data.paidAmount = 0;
      data.balanceDue = invoice.total;
      break;
    default:
      break;
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                   */
/* -------------------------------------------------------------------------- */

export async function createInvoice(
  req: Request,
  userId: string,
  input: CreateInvoiceInput,
) {
  await assertWithinPlanLimits(userId, "invoices");
  await assertClientBillable(userId, input.clientId);
  if (input.recurringId) {
    await assertRecurringScheduleLink(userId, input.recurringId, input.clientId);
  }

  const business = await getMyBusiness(userId);
  const taxRate = input.taxRate ?? business.taxRate;
  const discount = input.discount ?? 0;
  const discountType = (input.discountType ?? "FIXED") as DiscountType;
  const currency = input.currency ?? business.currency;
  const issueDate = input.issueDate ?? new Date();
  const dueDate = resolveDueDate(
    issueDate,
    input.dueDate,
    business.defaultDueDays,
  );
  assertDateOrder(issueDate, dueDate);

  const computed = calculateTotals({
    items: input.items,
    taxRate,
    discount,
    discountType,
  });

  const invoice = await prisma.$transaction(async (tx) => {
    const number = await allocateInvoiceNumber(tx, userId);

    return tx.invoice.create({
      data: {
        userId,
        clientId: input.clientId,
        number,
        status: "DRAFT",
        issueDate,
        dueDate,
        subtotal: computed.subtotal,
        taxRate,
        taxAmount: computed.taxAmount,
        discount,
        discountType,
        total: computed.total,
        paidAmount: 0,
        balanceDue: computed.balanceDue,
        currency,
        notes: normaliseNullable(input.notes),
        terms: normaliseNullable(input.terms) ?? business.defaultTerms,
        footer: normaliseNullable(input.footer),
        isRecurring: Boolean(input.recurringId),
        recurringId: input.recurringId ?? null,
        items: {
          create: computed.items,
        },
      },
      select: INVOICE_LIST_SELECT,
    });
  });

  await writeAuditLog({
    userId,
    action: "invoice.create",
    invoiceId: invoice.id,
    metadata: {
      number: invoice.number,
      clientId: input.clientId,
      recurringId: input.recurringId ?? null,
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return getInvoiceDetail(userId, invoice.id);
}

/* -------------------------------------------------------------------------- */
/*                                    List                                    */
/* -------------------------------------------------------------------------- */

export async function listInvoices(userId: string, query: ListInvoicesQuery) {
  const where: Prisma.InvoiceWhereInput = {
    userId,
    deletedAt: null,
  };

  if (query.search) {
    where.OR = [
      { number: { contains: query.search, mode: "insensitive" } },
      {
        client: {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { company: { contains: query.search, mode: "insensitive" } },
          ],
        },
      },
    ];
  }
  if (query.overdue === true) {
    where.status = { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] };
    where.dueDate = { lt: new Date() };
    where.balanceDue = { gt: 0 };
  } else if (query.status) {
    where.status = query.status;
  }
  if (query.clientId) where.clientId = query.clientId;
  if (query.recurringId) where.recurringId = query.recurringId;
  if (query.fromDate || query.toDate) {
    where.issueDate = {};
    if (query.fromDate) where.issueDate.gte = query.fromDate;
    if (query.toDate) where.issueDate.lte = query.toDate;
  }

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip,
      take: query.limit,
      select: INVOICE_LIST_SELECT,
    }),
  ]);

  return { rows, meta: buildPaginationMeta(total, query) };
}

/* -------------------------------------------------------------------------- */
/*                                   Stats                                    */
/* -------------------------------------------------------------------------- */

export async function getInvoiceStats(userId: string) {
  const monthStart = startOfMonth(new Date());

  const [usage, total, thisMonth, statusGroups, outstanding] =
    await Promise.all([
      getUsageSnapshot(userId),
      prisma.invoice.count({ where: { userId, deletedAt: null } }),
      prisma.invoice.count({
        where: { userId, deletedAt: null, createdAt: { gte: monthStart } },
      }),
      prisma.invoice.groupBy({
        by: ["status"],
        where: { userId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: {
          userId,
          deletedAt: null,
          status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] },
        },
        _sum: { balanceDue: true },
      }),
    ]);

  const limits = getPlanLimits(usage.plan);
  const byStatus = statusGroups.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});

  return {
    total,
    thisMonth,
    outstandingBalance: outstanding._sum.balanceDue ?? 0,
    byStatus,
    plan: usage.plan,
    usage: {
      invoicesThisMonth: usage.invoicesThisMonth,
      limit: limits.maxInvoicesPerMonth,
      remaining:
        limits.maxInvoicesPerMonth === Number.POSITIVE_INFINITY
          ? null
          : Math.max(0, limits.maxInvoicesPerMonth - usage.invoicesThisMonth),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Detail                                   */
/* -------------------------------------------------------------------------- */

export async function getInvoiceDetail(userId: string, invoiceId: string) {
  const [invoice, paymentSummary] = await Promise.all([
    findOwnedInvoice(userId, invoiceId),
    prisma.payment.groupBy({
      by: ["status"],
      where: { invoiceId },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  if (invoice.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

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
    allowedTransitions: ALLOWED_STATUS_TRANSITIONS[invoice.status] ?? [],
  };
}

export function getInvoiceMeta() {
  return {
    statuses: INVOICE_STATUSES,
    transitions: ALLOWED_STATUS_TRANSITIONS,
    editableStatuses: EDITABLE_STATUSES,
    deletableStatuses: DELETABLE_STATUSES,
    sendableStatuses: SENDABLE_STATUSES,
    resendableStatuses: RESENDABLE_STATUSES,
    remindableStatuses: REMINDABLE_STATUSES,
    emailConfigured: isEmailConfigured(),
  };
}

/* -------------------------------------------------------------------------- */
/*                              PDF + delivery                                */
/* -------------------------------------------------------------------------- */

export async function downloadInvoicePdf(userId: string, invoiceId: string) {
  return getInvoicePdfAsset(userId, invoiceId);
}

export async function sendInvoice(
  req: Request,
  userId: string,
  invoiceId: string,
  input: SendInvoiceInput,
) {
  const current = await findOwnedInvoice(userId, invoiceId);
  if (current.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  assertInvoiceSendable(current.status);
  assertSendableInvoice({ total: current.total, items: current.items });

  const recipient = input.to ?? current.client.email;
  const [pdfAsset, portalUrl] = await Promise.all([
    getInvoicePdfAsset(userId, invoiceId),
    getClientPortalLink(userId, current.clientId),
  ]);

  await sendInvoiceEmail({
    to: recipient,
    data: pdfAsset.data,
    pdfBuffer: pdfAsset.buffer,
    personalMessage: normaliseNullable(input.message),
    portalUrl,
  });

  const now = new Date();
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      sentAt: now,
      ...(current.status === "DRAFT" ? { status: "SENT" as const } : {}),
    },
  });

  await writeAuditLog({
    userId,
    action: "invoice.send",
    invoiceId,
    metadata: {
      number: current.number,
      to: recipient,
      previousStatus: current.status,
      firstSend: current.status === "DRAFT",
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return getInvoiceDetail(userId, invoiceId);
}

export async function remindInvoice(
  req: Request,
  userId: string,
  invoiceId: string,
  input: RemindInvoiceInput,
) {
  const current = await findOwnedInvoice(userId, invoiceId);
  if (current.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  assertInvoiceRemindable(current.status);
  if (current.balanceDue <= 0) {
    throw new ApiError(409, "Invoice has no outstanding balance", {
      code: "INVOICE_ALREADY_PAID",
    });
  }

  const recipient = input.to ?? current.client.email;
  const [pdfAsset, portalUrl] = await Promise.all([
    getInvoicePdfAsset(userId, invoiceId),
    getClientPortalLink(userId, current.clientId),
  ]);

  await sendInvoiceEmail({
    to: recipient,
    data: pdfAsset.data,
    pdfBuffer: pdfAsset.buffer,
    personalMessage: normaliseNullable(input.message),
    isReminder: true,
    portalUrl,
  });

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { reminderSentAt: new Date() },
  });

  await writeAuditLog({
    userId,
    action: "invoice.remind",
    invoiceId,
    metadata: {
      number: current.number,
      to: recipient,
      balanceDue: current.balanceDue,
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  await notifyReminderSent({
    userId,
    invoiceId,
    invoiceNumber: current.number,
    recipient,
  });

  return getInvoiceDetail(userId, invoiceId);
}

/* -------------------------------------------------------------------------- */
/*                                   Update                                   */
/* -------------------------------------------------------------------------- */

export async function updateInvoice(
  req: Request,
  userId: string,
  invoiceId: string,
  input: UpdateInvoiceInput,
) {
  const current = await findOwnedInvoice(userId, invoiceId);
  if (current.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }
  assertEditableStatus(current.status);

  const clientId = input.clientId ?? current.clientId;
  if (input.clientId) await assertClientBillable(userId, clientId);

  const items =
    input.items ??
    current.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      unit: item.unit,
      taxable: item.taxable,
      order: item.order,
    }));

  const taxRate = input.taxRate ?? current.taxRate;
  const discount = input.discount ?? current.discount;
  const discountType = (input.discountType ??
    current.discountType) as DiscountType;

  const issueDate = input.issueDate ?? current.issueDate;
  const dueDate = input.dueDate ?? current.dueDate;
  assertDateOrder(issueDate, dueDate);

  const computed = calculateTotals({
    items,
    taxRate,
    discount,
    discountType,
    paidAmount: current.paidAmount,
  });

  await prisma.$transaction(async (tx) => {
    if (input.items) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.issueDate ? { issueDate: input.issueDate } : {}),
        ...(input.dueDate ? { dueDate: input.dueDate } : {}),
        subtotal: computed.subtotal,
        taxRate,
        taxAmount: computed.taxAmount,
        discount,
        discountType,
        total: computed.total,
        balanceDue: computed.balanceDue,
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.notes !== undefined
          ? { notes: normaliseNullable(input.notes) }
          : {}),
        ...(input.terms !== undefined
          ? { terms: normaliseNullable(input.terms) }
          : {}),
        ...(input.footer !== undefined
          ? { footer: normaliseNullable(input.footer) }
          : {}),
        ...(input.items
          ? { items: { create: computed.items } }
          : {}),
      },
    });
  });

  const updated = await findOwnedInvoice(userId, invoiceId);

  await writeAuditLog({
    userId,
    action: "invoice.update",
    invoiceId,
    metadata: { number: updated.number, fields: Object.keys(input) },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return getInvoiceDetail(userId, invoiceId);
}

/* -------------------------------------------------------------------------- */
/*                              Status transition                             */
/* -------------------------------------------------------------------------- */

export async function updateInvoiceStatus(
  req: Request,
  userId: string,
  invoiceId: string,
  input: UpdateInvoiceStatusInput,
) {
  const current = await findOwnedInvoice(userId, invoiceId);
  if (current.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  assertStatusTransition(current.status, input.status);

  if (input.status === "SENT") {
    assertSendableInvoice({ total: current.total, items: current.items });
  }

  const data = resolveStatusSideEffects(input.status, current, input);

  await prisma.invoice.update({
    where: { id: invoiceId },
    data,
  });

  await writeAuditLog({
    userId,
    action: "invoice.status_change",
    invoiceId,
    metadata: {
      number: current.number,
      from: current.status,
      to: input.status,
    },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return getInvoiceDetail(userId, invoiceId);
}

/* -------------------------------------------------------------------------- */
/*                                 Duplicate                                  */
/* -------------------------------------------------------------------------- */

export async function duplicateInvoice(
  req: Request,
  userId: string,
  invoiceId: string,
) {
  const source = await findOwnedInvoice(userId, invoiceId);
  if (source.deletedAt) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }

  await assertWithinPlanLimits(userId, "invoices");
  await assertClientBillable(userId, source.clientId);

  const business = await getMyBusiness(userId);
  const issueDate = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + business.defaultDueDays);

  const invoice = await prisma.$transaction(async (tx) =>
    createInvoiceFromTemplateInTransaction(tx, userId, source, {
      clientId: source.clientId,
      issueDate,
      dueDate,
    }),
  );

  await writeAuditLog({
    userId,
    action: "invoice.duplicate",
    invoiceId: invoice.id,
    metadata: { sourceInvoiceId: invoiceId, number: invoice.number },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });

  return getInvoiceDetail(userId, invoice.id);
}

/* -------------------------------------------------------------------------- */
/*                               Soft delete                                  */
/* -------------------------------------------------------------------------- */

export async function deleteInvoice(
  req: Request,
  userId: string,
  invoiceId: string,
): Promise<void> {
  const current = await findOwnedInvoice(userId, invoiceId);
  if (current.deletedAt) {
    throw new ApiError(409, "Invoice is already deleted", {
      code: "INVOICE_ALREADY_DELETED",
    });
  }
  assertDeletableStatus(current.status);

  const completedPayments = await prisma.payment.count({
    where: { invoiceId, status: "COMPLETED" },
  });
  if (completedPayments > 0) {
    throw new ApiError(
      409,
      "Cannot delete an invoice that has completed payments",
      {
        code: "INVOICE_HAS_PAYMENTS",
        details: { completedPayments },
      },
    );
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({
    userId,
    action: "invoice.delete",
    invoiceId,
    metadata: { number: current.number },
    ipAddress: getRequestIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  });
}
