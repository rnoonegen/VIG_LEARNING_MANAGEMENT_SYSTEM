import type { NotificationDto, NotificationType, Role } from '@vig/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma.js';

/**
 * Notification volume is a locked product rule, not a preference (BR-14):
 *   Parent  — exactly one per week: the weekly update is ready.
 *   Teacher — scheduling changes and class-record reminders only.
 *   Admin   — actionable operational issues, including password-reset requests.
 *
 * The allow-list below is enforced at the single write path so no future caller
 * can quietly start emailing parents about attendance.
 */
const ALLOWED_BY_ROLE: Record<Role, NotificationType[]> = {
  PARENT: ['WEEKLY_UPDATE_READY'],
  // The answer to a leave request is the one thing a teacher is waiting on: they
  // cannot plan around a day off until somebody says yes.
  TEACHER: ['SCHEDULE_CHANGED', 'CLASS_RECORD_DUE', 'LEAVE_DECIDED'],
  ADMIN: [
    'AVAILABILITY_CONFLICT',
    'TEACHER_AVAILABILITY_CHANGE',
    'STUDENT_AVAILABILITY_CHANGE',
    'INCOMPLETE_SETUP',
    'SCHEDULE_CHANGED',
    'PASSWORD_RESET_REQUEST',
    'LEAVE_REQUESTED',
    // A teacher letting a recording deadline pass is an operational issue only an
    // admin can act on: the class went undocumented and cannot be recovered.
    'CLASS_RECORD_DUE',
  ],
};

export interface NotifyInput {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Prisma.InputJsonValue;
}

/**
 * The only way a notification is created.
 * Silently drops anything the recipient's role is not allowed to receive, so a
 * misplaced call degrades to "no notification" rather than breaking BR-14.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.recipientUserId },
    select: { role: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') return;

  if (!ALLOWED_BY_ROLE[user.role as Role].includes(input.type)) {
    console.warn(`[notifications] dropped ${input.type} for ${user.role} — not permitted by BR-14`);
    return;
  }

  await prisma.notification.create({
    data: {
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: input.payload,
    },
  });
}

/** Fan-out helper for the "tell every admin" case. */
export async function notifyAllAdmins(input: Omit<NotifyInput, 'recipientUserId'>): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  await Promise.all(admins.map((a) => notify({ ...input, recipientUserId: a.id })));
}

export async function list(userId: string): Promise<NotificationDto[]> {
  const rows = await prisma.notification.findMany({
    where: { recipientUserId: userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    payload: (n.payload as Record<string, unknown> | null) ?? null,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { recipientUserId: userId, readAt: null } });
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientUserId: userId },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { recipientUserId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}
