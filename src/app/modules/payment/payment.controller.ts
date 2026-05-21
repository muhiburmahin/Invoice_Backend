import type { RequestHandler } from "express";

import { ApiError } from "../../errors/ApiError";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";

import {
  cancelPayment,
  getPaymentDetail,
  getPaymentMeta,
  getPaymentStats,
  listInvoicePayments,
  listPayments,
  recordPayment,
  updatePaymentStatus,
} from "./payment.service";

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
    throw new ApiError(400, "Id is required", { code: "MISSING_PARAM" });
  }
  return value;
}

export const listPaymentsHandler: RequestHandler = catchAsync(async (req, res) => {
  const { rows, meta } = await listPayments(
    getUserId(req),
    req.query as unknown as Parameters<typeof listPayments>[1],
  );
  sendSuccess(res, { payments: rows }, 200, meta);
});

export const paymentStatsHandler: RequestHandler = catchAsync(async (req, res) => {
  const stats = await getPaymentStats(getUserId(req));
  sendSuccess(res, { stats });
});

export const paymentMetaHandler: RequestHandler = (_req, res) => {
  sendSuccess(res, getPaymentMeta());
};

export const recordPaymentHandler: RequestHandler = catchAsync(async (req, res) => {
  const { payment, invoice } = await recordPayment(req, getUserId(req), req.body);
  sendSuccess(
    res,
    { payment, invoice, message: "Payment recorded successfully" },
    201,
  );
});

export const getPaymentHandler: RequestHandler = catchAsync(async (req, res) => {
  const data = await getPaymentDetail(getUserId(req), getParamId(req));
  sendSuccess(res, data);
});

export const updatePaymentStatusHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const data = await updatePaymentStatus(
      req,
      getUserId(req),
      getParamId(req),
      req.body,
    );
    sendSuccess(res, {
      ...data,
      message: `Payment status updated to ${data.payment.status}`,
    });
  },
);

export const cancelPaymentHandler: RequestHandler = catchAsync(async (req, res) => {
  await cancelPayment(req, getUserId(req), getParamId(req));
  sendSuccess(res, { message: "Pending payment cancelled" });
});

export const listInvoicePaymentsHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const data = await listInvoicePayments(getUserId(req), getParamId(req));
    sendSuccess(res, data);
  },
);
