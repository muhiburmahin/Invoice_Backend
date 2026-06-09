import type { RequestHandler } from "express";

import { ApiError } from "../../errors/ApiError";
import { getValidatedQuery } from "../../middlewares/validateRequest";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";

import {
  deleteNotification,
  deleteReadNotifications,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification.service";

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
    throw new ApiError(400, "Notification id is required", {
      code: "MISSING_PARAM",
    });
  }
  return value;
}

export const listNotificationsHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const { rows, meta } = await listNotifications(
      getUserId(req),
      getValidatedQuery<Parameters<typeof listNotifications>[1]>(req),
    );
    sendSuccess(res, { notifications: rows }, 200, meta);
  },
);

export const unreadCountHandler: RequestHandler = catchAsync(async (req, res) => {
  const result = await getUnreadNotificationCount(getUserId(req));
  sendSuccess(res, result);
});

export const markNotificationReadHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const notification = await markNotificationRead(
      getUserId(req),
      getParamId(req),
    );
    sendSuccess(res, {
      notification,
      message: "Notification marked as read",
    });
  },
);

export const markAllNotificationsReadHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const result = await markAllNotificationsRead(getUserId(req));
    sendSuccess(res, {
      ...result,
      message: "All notifications marked as read",
    });
  },
);

export const deleteNotificationHandler: RequestHandler = catchAsync(
  async (req, res) => {
    await deleteNotification(getUserId(req), getParamId(req));
    sendSuccess(res, { message: "Notification deleted successfully" });
  },
);

export const deleteReadNotificationsHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const result = await deleteReadNotifications(getUserId(req));
    sendSuccess(res, {
      ...result,
      message: "Read notifications cleared",
    });
  },
);
