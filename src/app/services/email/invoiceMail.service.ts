import { format } from "date-fns";

import { ApiError } from "../../errors/ApiError";
import { buildInvoicePdfFilename } from "../pdf/invoicePdf.service";
import type { InvoicePrintData } from "../pdf/invoicePdf.types";

import { isEmailConfigured, sendTransactionalMail } from "./smtp.service";

export function assertEmailConfigured(): void {
  if (!isEmailConfigured()) {
    throw new ApiError(
      503,
      "Email is not configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM.",
      { code: "EMAIL_NOT_CONFIGURED" },
    );
  }
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildInvoiceEmailHtml(input: {
  data: InvoicePrintData;
  personalMessage?: string | null;
  isReminder?: boolean;
}): string {
  const { business, client, invoice } = input.data;
  const headline = input.isReminder
    ? `Reminder: Invoice ${invoice.number} is due`
    : `Invoice ${invoice.number} from ${business.name}`;

  const messageBlock = input.personalMessage
    ? `<p style="margin:16px 0;padding:12px;background:#f9fafb;border-radius:6px;">${escapeHtml(input.personalMessage)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
  <body style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
    <h2 style="margin-bottom:8px;">${escapeHtml(headline)}</h2>
    <p>Hi ${escapeHtml(client.name)},</p>
    <p>${
      input.isReminder
        ? "This is a friendly reminder about your outstanding invoice."
        : `Please find your invoice from <strong>${escapeHtml(business.name)}</strong> attached.`
    }</p>
    ${messageBlock}
    <table style="margin:16px 0;border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Invoice</td><td><strong>${escapeHtml(invoice.number)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Issue date</td><td>${format(invoice.issueDate, "MMM d, yyyy")}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Due date</td><td>${format(invoice.dueDate, "MMM d, yyyy")}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Amount due</td><td><strong>${formatMoney(invoice.balanceDue > 0 ? invoice.balanceDue : invoice.total, invoice.currency)}</strong></td></tr>
    </table>
    <p>The invoice PDF is attached to this email.</p>
    <p style="color:#6b7280;font-size:12px;margin-top:24px;">Sent via ${escapeHtml(business.name)}</p>
  </body>
</html>`;
}

function buildInvoiceEmailText(input: {
  data: InvoicePrintData;
  personalMessage?: string | null;
  isReminder?: boolean;
}): string {
  const { business, client, invoice } = input.data;
  const lines = [
    input.isReminder
      ? `Reminder: Invoice ${invoice.number} from ${business.name}`
      : `Invoice ${invoice.number} from ${business.name}`,
    "",
    `Hi ${client.name},`,
    input.isReminder
      ? "This is a friendly reminder about your outstanding invoice."
      : "Please find your invoice attached.",
    "",
    `Invoice: ${invoice.number}`,
    `Issue date: ${format(invoice.issueDate, "MMM d, yyyy")}`,
    `Due date: ${format(invoice.dueDate, "MMM d, yyyy")}`,
    `Amount due: ${formatMoney(invoice.balanceDue > 0 ? invoice.balanceDue : invoice.total, invoice.currency)}`,
  ];
  if (input.personalMessage) {
    lines.push("", input.personalMessage);
  }
  return lines.join("\n");
}

export async function sendInvoiceEmail(input: {
  to: string;
  data: InvoicePrintData;
  pdfBuffer: Buffer;
  personalMessage?: string | null;
  isReminder?: boolean;
}): Promise<void> {
  assertEmailConfigured();

  const subject = input.isReminder
    ? `Payment reminder: Invoice ${input.data.invoice.number}`
    : `Invoice ${input.data.invoice.number} from ${input.data.business.name}`;

  await sendTransactionalMail({
    to: input.to,
    subject,
    html: buildInvoiceEmailHtml({
      data: input.data,
      personalMessage: input.personalMessage,
      isReminder: input.isReminder,
    }),
    text: buildInvoiceEmailText({
      data: input.data,
      personalMessage: input.personalMessage,
      isReminder: input.isReminder,
    }),
    attachments: [
      {
        filename: buildInvoicePdfFilename(input.data.invoice.number),
        content: input.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
