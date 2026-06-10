import { Router } from "express";

import {
  bootstrapUser,
  requireActiveUser,
  requireAuth,
  requireRole,
  validateRequest,
} from "../../middlewares";

import {
  activityLogsHandler,
  deleteUserHandler,
  getUserDetailHandler,
  listUpgradeRequestsHandler,
  listUsersHandler,
  runScheduledJobsHandler,
  statsHandler,
  triggerResetHandler,
  updateUserPlanHandler,
  updateUserRoleHandler,
  updateUserStatusHandler,
} from "./admin.controller";
import {
  activityLogsQuerySchema,
  listUsersQuerySchema,
  runScheduledJobsSchema,
  updateUserPlanSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from "./admin.validation";

const adminRouter = Router();

// All admin routes are authenticated + role-gated.
// SUPPORT staff can hit read-only routes; SUPER_ADMIN can do everything.
adminRouter.use(
  requireAuth,
  requireActiveUser,
  bootstrapUser,
  requireRole("SUPPORT", "SUPER_ADMIN"),
);

/* ------------------------------- Read (SUPPORT + SUPER_ADMIN) ------------- */

adminRouter.get(
  "/users",
  validateRequest({ query: listUsersQuerySchema.shape.query }),
  listUsersHandler,
);

adminRouter.get(
  "/users/:id",
  validateRequest({ params: userIdParamSchema.shape.params }),
  getUserDetailHandler,
);

adminRouter.get("/stats", statsHandler);

adminRouter.get("/upgrade-requests", listUpgradeRequestsHandler);

adminRouter.get(
  "/activity-logs",
  validateRequest({ query: activityLogsQuerySchema.shape.query }),
  activityLogsHandler,
);

adminRouter.post(
  "/users/:id/reset-password",
  validateRequest({ params: userIdParamSchema.shape.params }),
  triggerResetHandler,
);

/* ------------------------ Write — SUPER_ADMIN only ----------------------- */

adminRouter.patch(
  "/users/:id/status",
  requireRole("SUPER_ADMIN"),
  validateRequest({
    params: updateUserStatusSchema.shape.params,
    body: updateUserStatusSchema.shape.body,
  }),
  updateUserStatusHandler,
);

adminRouter.patch(
  "/users/:id/role",
  requireRole("SUPER_ADMIN"),
  validateRequest({
    params: updateUserRoleSchema.shape.params,
    body: updateUserRoleSchema.shape.body,
  }),
  updateUserRoleHandler,
);

adminRouter.patch(
  "/users/:id/plan",
  requireRole("SUPER_ADMIN"),
  validateRequest({
    params: updateUserPlanSchema.shape.params,
    body: updateUserPlanSchema.shape.body,
  }),
  updateUserPlanHandler,
);

adminRouter.delete(
  "/users/:id",
  requireRole("SUPER_ADMIN"),
  validateRequest({ params: userIdParamSchema.shape.params }),
  deleteUserHandler,
);

adminRouter.post(
  "/jobs/run",
  requireRole("SUPER_ADMIN"),
  validateRequest({ body: runScheduledJobsSchema.shape.body }),
  runScheduledJobsHandler,
);

export { adminRouter };
