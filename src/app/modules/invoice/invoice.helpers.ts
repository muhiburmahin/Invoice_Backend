import type {
  DiscountType,
  InvoiceStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";

import {
  ALLOWED_STATUS_TRANSITIONS,
  DELETABLE_STATUSES,
  EDITABLE_STATUSES,
} from "./invoice.constants";

export type LineItemInput = {
  description: string;
  quantity: number;
  rate: number;
  unit?: string | null;
  taxable?: boolean;
  order?: number;
};

export type ComputedTotals = {
  subtotal: number;
  taxAmount: number;
  total: number;
  balanceDue: number;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    unit: string | null;
    taxable: boolean;
    order: number;
  }>;
};

/** Round to 2 decimal places — standard for currency. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateTotals(input: {
  items: LineItemInput[];
  taxRate: number;
  discount: number;
  discountType: DiscountType;
  paidAmount?: number;
}): ComputedTotals {
  const mappedItems = input.items.map((item, index) => {
    const amount = roundMoney(item.quantity * item.rate);
    return {
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount,
      unit: item.unit?.trim() || null,
      taxable: item.taxable ?? true,
      order: item.order ?? index,
    };
  });

  const subtotal = roundMoney(
    mappedItems.reduce((sum, item) => sum + item.amount, 0),
  );

  const taxableSubtotal = roundMoney(
    mappedItems
      .filter((item) => item.taxable)
      .reduce((sum, item) => sum + item.amount, 0),
  );

  const discountAmount =
    input.discountType === "PERCENTAGE"
      ? roundMoney(subtotal * (input.discount / 100))
      : roundMoney(input.discount);

  if (discountAmount > subtotal) {
    throw new ApiError(409, "Discount cannot exceed the invoice subtotal", {
      code: "DISCOUNT_EXCEEDS_SUBTOTAL",
      details: { subtotal, discount: discountAmount },
    });
  }

  // Apply discount proportionally — taxable lines absorb their share of the
  // discount before tax is calculated (industry-standard line-item tax).
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxableAfterDiscount = roundMoney(
    Math.max(0, taxableSubtotal * (1 - discountRatio)),
  );

  const taxAmount = roundMoney(taxableAfterDiscount * (input.taxRate / 100));
  const total = roundMoney(subtotal - discountAmount + taxAmount);
  const paidAmount = roundMoney(input.paidAmount ?? 0);
  const balanceDue = roundMoney(Math.max(0, total - paidAmount));

  return {
    subtotal,
    taxAmount,
    total,
    balanceDue,
    items: mappedItems,
  };
}

export function assertSendableInvoice(invoice: {
  total: number;
  items: unknown[];
}): void {
  if (!invoice.items.length) {
    throw new ApiError(409, "Invoice must have at least one line item before sending", {
      code: "INVOICE_NO_ITEMS",
    });
  }
  if (invoice.total <= 0) {
    throw new ApiError(409, "Invoice total must be greater than zero before sending", {
      code: "INVOICE_ZERO_TOTAL",
    });
  }
}

export function assertEditableStatus(status: InvoiceStatus): void {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw new ApiError(
      409,
      `Only ${EDITABLE_STATUSES.join(", ")} invoices can be edited`,
      { code: "INVOICE_NOT_EDITABLE", details: { status } },
    );
  }
}

export function assertDeletableStatus(status: InvoiceStatus): void {
  if (!DELETABLE_STATUSES.includes(status)) {
    throw new ApiError(
      409,
      `Only ${DELETABLE_STATUSES.join(", ")} invoices can be deleted`,
      { code: "INVOICE_NOT_DELETABLE", details: { status } },
    );
  }
}

export function assertStatusTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): void {
  if (from === to) {
    throw new ApiError(409, `Invoice is already ${to}`, {
      code: "STATUS_UNCHANGED",
    });
  }
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ApiError(
      409,
      `Cannot change invoice status from ${from} to ${to}`,
      {
        code: "INVALID_STATUS_TRANSITION",
        details: { from, to, allowed },
      },
    );
  }
}

/** Atomically allocate the next invoice number from the user's Business row. */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string> {
  const business = await tx.business.findUnique({
    where: { userId },
    select: { invoicePrefix: true, nextNumber: true },
  });
  if (!business) {
    throw new ApiError(500, "Business profile not found", {
      code: "BUSINESS_NOT_FOUND",
    });
  }

  const number = `${business.invoicePrefix}-${String(business.nextNumber).padStart(4, "0")}`;

  await tx.business.update({
    where: { userId },
    data: { nextNumber: { increment: 1 } },
  });

  return number;
}

export async function findOwnedInvoice(userId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: {
      items: { orderBy: { order: "asc" } },
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          company: true,
          deletedAt: true,
          isActive: true,
        },
      },
    },
  });
  if (!invoice) {
    throw new ApiError(404, "Invoice not found", { code: "INVOICE_NOT_FOUND" });
  }
  return invoice;
}

export async function assertClientBillable(
  userId: string,
  clientId: string,
): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, userId, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (!client) {
    throw new ApiError(404, "Client not found or inactive", {
      code: "CLIENT_NOT_BILLABLE",
    });
  }
}
