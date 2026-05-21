import type { RequestHandler } from "express";

import { ApiError } from "../../errors/ApiError";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";

import {
  deleteUser,
  getPlatformStats,
  getUserDetail,
  listActivityLogs,
  listUsers,
  runAdminScheduledJobs,
  triggerPasswordReset,
  updateUserPlan,
  updateUserRole,
  updateUserStatus,
} from "./admin.service";

function getActor(req: Parameters<RequestHandler>[0]) {
  const id = req.auth?.user?.id;
  const role = req.userRole;
  if (!id || !role) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }
  return { id, role };
}

/** Express 5 returns `string | string[]` for route params. Always coerce. */
function getParamId(req: Parameters<RequestHandler>[0]): string {
  const raw = req.params.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new ApiError(400, "User id is required", { code: "MISSING_PARAM" });
  }
  return value;
}

export const listUsersHandler: RequestHandler = catchAsync(async (req, res) => {
  const actor = getActor(req);
  const { rows, meta } = await listUsers(
    actor.role,
    req.query as unknown as Parameters<typeof listUsers>[1],
  );
  sendSuccess(res, { users: rows }, 200, meta);
});

export const getUserDetailHandler: RequestHandler = catchAsync(async (req, res) => {
  const actor = getActor(req);
  const data = await getUserDetail(actor.role, getParamId(req));
  sendSuccess(res, data);
});

export const updateUserStatusHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const actor = getActor(req);
    const user = await updateUserStatus(
      req,
      actor.id,
      actor.role,
      getParamId(req),
      req.body,
    );
    sendSuccess(res, {
      user,
      message: req.body.isActive
        ? "User has been activated"
        : "User has been deactivated and all sessions revoked",
    });
  },
);

export const updateUserRoleHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const actor = getActor(req);
    const user = await updateUserRole(
      req,
      actor.id,
      actor.role,
      getParamId(req),
      req.body,
    );
    sendSuccess(res, { user, message: `Role updated to ${user.role}` });
  },
);

export const updateUserPlanHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const actor = getActor(req);
    const subscription = await updateUserPlan(
      req,
      actor.id,
      actor.role,
      getParamId(req),
      req.body,
    );
    sendSuccess(res, { subscription, message: "Subscription updated" });
  },
);

export const deleteUserHandler: RequestHandler = catchAsync(async (req, res) => {
  const actor = getActor(req);
  await deleteUser(req, actor.id, actor.role, getParamId(req));
  sendSuccess(res, { message: "User deleted (soft-deleted, sessions revoked)" });
});

export const triggerResetHandler: RequestHandler = catchAsync(async (req, res) => {
  const actor = getActor(req);
  await triggerPasswordReset(req, actor.id, actor.role, getParamId(req));
  sendSuccess(res, {
    message: "Password reset email has been sent to the user",
  });
});

export const statsHandler: RequestHandler = catchAsync(async (req, res) => {
  const actor = getActor(req);
  const stats = await getPlatformStats(actor.role);
  sendSuccess(res, { stats });
});

export const activityLogsHandler: RequestHandler = catchAsync(async (req, res) => {
  const actor = getActor(req);
  const { rows, meta } = await listActivityLogs(
    actor.role,
    req.query as unknown as Parameters<typeof listActivityLogs>[1],
  );
  sendSuccess(res, { logs: rows }, 200, meta);
});

export const runScheduledJobsHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const actor = getActor(req);
    const result = await runAdminScheduledJobs(
      req,
      actor.id,
      actor.role,
      req.body,
    );
    sendSuccess(res, {
      result,
      message: "Scheduled jobs completed successfully",
    });
  },
);
