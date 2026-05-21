/** Routes mounted at /api/v1/admin. */
export const ADMIN_ROUTES = {
  users: "/users",
  userById: "/users/:id",
  userStatus: "/users/:id/status",
  userRole: "/users/:id/role",
  userPlan: "/users/:id/plan",
  resetUserPassword: "/users/:id/reset-password",
  stats: "/stats",
  activityLogs: "/activity-logs",
  runJobs: "/jobs/run",
} as const;

/**
 * Capability matrix — used by the admin service to decide whether a SUPPORT
 * actor is allowed to perform a write. SUPER_ADMIN bypasses these checks.
 */
export const SUPPORT_CAPABILITIES = {
  readUsers: true,
  readSubscriptions: true,
  readActivityLogs: true,
  readStats: true,
  triggerPasswordReset: true,
  updateUserStatus: false,
  updateUserRole: false,
  updateUserPlan: false,
  deleteUser: false,
  runScheduledJobs: false,
} as const;
