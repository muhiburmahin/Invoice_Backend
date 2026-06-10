import type { Prisma } from "@prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../shared/prisma";
import { buildPaginationMeta } from "../../shared/pagination";

import { NOTIFICATION_LIST_SELECT } from "./notification.constants";
import type { ListNotificationsQuery } from "./notification.validation";

async function findOwnedNotification(userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: NOTIFICATION_LIST_SELECT,
  });

  if (!notification) {
    throw new ApiError(404, "Notification not found", {
      code: "NOTIFICATION_NOT_FOUND",
    });
  }

  return notification;
}

export async function listNotifications(
  userId: string,
  query: ListNotificationsQuery,
) {
  const where: Prisma.NotificationWhereInput = { userId };

  if (typeof query.isRead === "boolean") {
    where.isRead = query.isRead;
  }
  if (query.type) {
    where.type = query.type;
  }

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip,
      take: query.limit,
      select: NOTIFICATION_LIST_SELECT,
    }),
  ]);

  return {
    rows,
    meta: buildPaginationMeta(total, query),
  };
}

export async function getUnreadNotificationCount(userId: string) {
  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  return { unreadCount };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
) {
  const current = await findOwnedNotification(userId, notificationId);

  if (current.isRead) {
    return current;
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
    select: NOTIFICATION_LIST_SELECT,
  });
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  return { updatedCount: result.count };
}

export async function deleteNotification(
  userId: string,
  notificationId: string,
): Promise<void> {
  await findOwnedNotification(userId, notificationId);

  await prisma.notification.delete({
    where: { id: notificationId },
  });
}

export async function deleteReadNotifications(userId: string) {
  const result = await prisma.notification.deleteMany({
    where: { userId, isRead: true },
  });

  return { deletedCount: result.count };
}
