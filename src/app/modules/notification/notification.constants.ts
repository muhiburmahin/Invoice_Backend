/** Routes mounted at `/api/v1/notifications`. */
export const NOTIFICATION_ROUTES = {
  list: "/",
  unreadCount: "/unread-count",
  readAll: "/read-all",
  byId: "/:id",
  markRead: "/:id/read",
} as const;

export const NOTIFICATION_TYPES = [
  "INVOICE_VIEWED",
  "INVOICE_PAID",
  "INVOICE_OVERDUE",
  "PAYMENT_RECEIVED",
  "SUBSCRIPTION_EXPIRING",
  "SUBSCRIPTION_CANCELLED",
  "REMINDER_SENT",
] as const;

export const NOTIFICATION_LIST_SELECT = {
  id: true,
  type: true,
  title: true,
  message: true,
  data: true,
  isRead: true,
  createdAt: true,
} as const;
