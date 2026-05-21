import type { RequestHandler } from "express";

import { ApiError } from "../../errors/ApiError";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";

import {
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  getInvoiceDetail,
  getInvoiceMeta,
  getInvoiceStats,
  listInvoices,
  updateInvoice,
  updateInvoiceStatus,
} from "./invoice.service";

function getUserId(req: Parameters<RequestHandler>[0]): string {
  const id = req.auth?.user?.id;
  if (!id) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }
  return id;
}

function getParamId(req: Parameters<RequestHandler>[0]): string {
  const raw = req.params.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new ApiError(400, "Invoice id is required", { code: "MISSING_PARAM" });
  }
  return value;
}

export const listInvoicesHandler: RequestHandler = catchAsync(async (req, res) => {
  const { rows, meta } = await listInvoices(
    getUserId(req),
    req.query as unknown as Parameters<typeof listInvoices>[1],
  );
  sendSuccess(res, { invoices: rows }, 200, meta);
});

export const invoiceStatsHandler: RequestHandler = catchAsync(async (req, res) => {
  const stats = await getInvoiceStats(getUserId(req));
  sendSuccess(res, { stats });
});

export const invoiceMetaHandler: RequestHandler = (_req, res) => {
  sendSuccess(res, getInvoiceMeta());
};

export const createInvoiceHandler: RequestHandler = catchAsync(async (req, res) => {
  const data = await createInvoice(req, getUserId(req), req.body);
  sendSuccess(res, { ...data, message: "Invoice created successfully" }, 201);
});

export const getInvoiceHandler: RequestHandler = catchAsync(async (req, res) => {
  const data = await getInvoiceDetail(getUserId(req), getParamId(req));
  sendSuccess(res, data);
});

export const updateInvoiceHandler: RequestHandler = catchAsync(async (req, res) => {
  const data = await updateInvoice(
    req,
    getUserId(req),
    getParamId(req),
    req.body,
  );
  sendSuccess(res, { ...data, message: "Invoice updated successfully" });
});

export const updateInvoiceStatusHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const data = await updateInvoiceStatus(
      req,
      getUserId(req),
      getParamId(req),
      req.body,
    );
    sendSuccess(res, {
      ...data,
      message: `Invoice status updated to ${data.invoice.status}`,
    });
  },
);

export const duplicateInvoiceHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const data = await duplicateInvoice(req, getUserId(req), getParamId(req));
    sendSuccess(
      res,
      { ...data, message: "Invoice duplicated as a new draft" },
      201,
    );
  },
);

export const deleteInvoiceHandler: RequestHandler = catchAsync(async (req, res) => {
  await deleteInvoice(req, getUserId(req), getParamId(req));
  sendSuccess(res, { message: "Invoice deleted successfully" });
});
