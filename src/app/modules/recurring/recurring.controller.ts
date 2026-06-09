import type { RequestHandler } from "express";

import { ApiError } from "../../errors/ApiError";
import { getValidatedQuery } from "../../middlewares/validateRequest";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";

import {
  createRecurringSchedule,
  deleteRecurringSchedule,
  getRecurringDetail,
  getRecurringMeta,
  getRecurringStats,
  listRecurringSchedules,
  listScheduleInvoices,
  runRecurringSchedule,
  updateRecurringSchedule,
  updateRecurringStatus,
} from "./recurring.service";

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

export const listRecurringHandler: RequestHandler = catchAsync(async (req, res) => {
  const { rows, meta } = await listRecurringSchedules(
    getUserId(req),
    getValidatedQuery<Parameters<typeof listRecurringSchedules>[1]>(req),
  );
  sendSuccess(res, { schedules: rows }, 200, meta);
});

export const recurringStatsHandler: RequestHandler = catchAsync(async (req, res) => {
  const stats = await getRecurringStats(getUserId(req));
  sendSuccess(res, { stats });
});

export const recurringMetaHandler: RequestHandler = (_req, res) => {
  sendSuccess(res, getRecurringMeta());
};

export const createRecurringHandler: RequestHandler = catchAsync(async (req, res) => {
  const schedule = await createRecurringSchedule(
    req,
    getUserId(req),
    req.body,
  );
  sendSuccess(
    res,
    { schedule, message: "Recurring schedule created successfully" },
    201,
  );
});

export const runRecurringHandler: RequestHandler = catchAsync(async (req, res) => {
  const data = await runRecurringSchedule(
    req,
    getUserId(req),
    getParamId(req),
    req.body,
  );
  sendSuccess(res, {
    ...data,
    message: "Recurring invoice generated successfully",
  }, 201);
});

export const getRecurringHandler: RequestHandler = catchAsync(async (req, res) => {
  const data = await getRecurringDetail(getUserId(req), getParamId(req));
  sendSuccess(res, data);
});

export const listScheduleInvoicesHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const data = await listScheduleInvoices(getUserId(req), getParamId(req));
    sendSuccess(res, data);
  },
);

export const updateRecurringHandler: RequestHandler = catchAsync(async (req, res) => {
  const schedule = await updateRecurringSchedule(
    req,
    getUserId(req),
    getParamId(req),
    req.body,
  );
  sendSuccess(res, {
    schedule,
    message: "Recurring schedule updated successfully",
  });
});

export const updateRecurringStatusHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const schedule = await updateRecurringStatus(
      req,
      getUserId(req),
      getParamId(req),
      req.body,
    );
    sendSuccess(res, {
      schedule,
      message: req.body.isActive
        ? "Recurring schedule activated"
        : "Recurring schedule deactivated",
    });
  },
);

export const deleteRecurringHandler: RequestHandler = catchAsync(async (req, res) => {
  await deleteRecurringSchedule(req, getUserId(req), getParamId(req));
  sendSuccess(res, { message: "Recurring schedule deleted successfully" });
});
