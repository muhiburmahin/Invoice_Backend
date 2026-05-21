import type { RequestHandler } from "express";

import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";

import {
  createPortalInvoiceCheckout,
  downloadPortalInvoicePdf,
  getPortalInvoiceDetail,
  getPortalMeta,
  listPortalInvoices,
} from "./portal.service";

function getPortalToken(req: Parameters<RequestHandler>[0]): string {
  const raw = req.params.token;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ?? "";
}

function getInvoiceId(req: Parameters<RequestHandler>[0]): string {
  const raw = req.params.invoiceId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ?? "";
}

export const portalMetaHandler: RequestHandler = catchAsync(async (req, res) => {
  const data = await getPortalMeta(getPortalToken(req));
  sendSuccess(res, data);
});

export const listPortalInvoicesHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const { rows, meta } = await listPortalInvoices(
      getPortalToken(req),
      req.query as unknown as Parameters<typeof listPortalInvoices>[1],
    );
    sendSuccess(res, { invoices: rows }, 200, meta);
  },
);

export const getPortalInvoiceHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const data = await getPortalInvoiceDetail(
      getPortalToken(req),
      getInvoiceId(req),
    );
    sendSuccess(res, data);
  },
);

export const getPortalInvoicePdfHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const { buffer, filename } = await downloadPortalInvoicePdf(
      getPortalToken(req),
      getInvoiceId(req),
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  },
);

export const createPortalCheckoutHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const data = await createPortalInvoiceCheckout(
      getPortalToken(req),
      getInvoiceId(req),
      req.body,
    );
    sendSuccess(res, data, 201);
  },
);
