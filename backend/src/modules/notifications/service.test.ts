import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * BR-14 — notification volume is a locked product rule, not a preference:
 *   Parent  — exactly one per week: the weekly update is ready.
 *   Teacher — scheduling changes and class-record reminders only.
 *   Admin   — actionable operational issues.
 *
 * The rule is enforced at the single write path, so a future caller cannot
 * quietly start notifying parents about attendance. These tests are what stops
 * that regression from shipping.
 */

const findUniqueUser = vi.fn();
const findManyUser = vi.fn();
const updateUser = vi.fn();
const createNotification = vi.fn();
const countNotification = vi.fn();
const createAuditLog = vi.fn();

vi.mock('../../prisma.js', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      findMany: (...a: unknown[]) => findManyUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
    notification: {
      create: (...a: unknown[]) => createNotification(...a),
      count: (...a: unknown[]) => countNotification(...a),
    },
    auditLog: { create: (...a: unknown[]) => createAuditLog(...a) },
  },
}));

const { getPreferences, notify, notifyAllAdmins, setPreferences, unreadCount } = await import(
  './service.js'
);

beforeEach(() => {
  vi.clearAllMocks();
  createNotification.mockResolvedValue({});
  countNotification.mockResolvedValue(0);
  updateUser.mockResolvedValue({});
  createAuditLog.mockResolvedValue({});
  // Keep the intentional "dropped" warning out of the test output.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function asUser(role: string, status = 'ACTIVE') {
  findUniqueUser.mockResolvedValue({ role, status });
}

describe('notify — role allow-list', () => {
  it('delivers the weekly update to a parent', async () => {
    asUser('PARENT');
    await notify({
      recipientUserId: 'u1',
      type: 'WEEKLY_UPDATE_READY',
      title: 'Ready',
      body: 'See the week.',
    });
    expect(createNotification).toHaveBeenCalledOnce();
  });

  it.each([
    'SCHEDULE_CHANGED',
    'CLASS_RECORD_DUE',
    'AVAILABILITY_CONFLICT',
    'INCOMPLETE_SETUP',
  ] as const)('drops %s for a parent', async (type) => {
    asUser('PARENT');
    await notify({ recipientUserId: 'u1', type, title: 't', body: 'b' });
    // One push a week means exactly one *type* reaches a parent at all.
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('delivers scheduling and class-record notices to a teacher', async () => {
    asUser('TEACHER');
    await notify({ recipientUserId: 'u1', type: 'SCHEDULE_CHANGED', title: 't', body: 'b' });
    await notify({ recipientUserId: 'u1', type: 'CLASS_RECORD_DUE', title: 't', body: 'b' });
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it('drops a weekly update aimed at a teacher', async () => {
    asUser('TEACHER');
    await notify({ recipientUserId: 'u1', type: 'WEEKLY_UPDATE_READY', title: 't', body: 'b' });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('delivers operational issues to an admin', async () => {
    asUser('ADMIN');
    await notify({ recipientUserId: 'u1', type: 'PASSWORD_RESET_REQUEST', title: 't', body: 'b' });
    expect(createNotification).toHaveBeenCalledOnce();
  });

  it('drops a weekly update aimed at an admin', async () => {
    asUser('ADMIN');
    await notify({ recipientUserId: 'u1', type: 'WEEKLY_UPDATE_READY', title: 't', body: 'b' });
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('notify — recipient state', () => {
  it('writes nothing for a user who does not exist', async () => {
    findUniqueUser.mockResolvedValue(null);
    await notify({ recipientUserId: 'ghost', type: 'WEEKLY_UPDATE_READY', title: 't', body: 'b' });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('writes nothing for a deactivated user', async () => {
    asUser('PARENT', 'ARCHIVED');
    await notify({ recipientUserId: 'u1', type: 'WEEKLY_UPDATE_READY', title: 't', body: 'b' });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('does not throw on a disallowed type — it degrades to no notification', async () => {
    asUser('PARENT');
    await expect(
      notify({ recipientUserId: 'u1', type: 'SCHEDULE_CHANGED', title: 't', body: 'b' }),
    ).resolves.toBeUndefined();
  });
});

describe('notifyAllAdmins', () => {
  it('fans out to every active admin only', async () => {
    findManyUser.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    asUser('ADMIN');

    await notifyAllAdmins({ type: 'PASSWORD_RESET_REQUEST', title: 't', body: 'b' });

    expect(findManyUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
    );
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when there are no admins', async () => {
    findManyUser.mockResolvedValue([]);
    await notifyAllAdmins({ type: 'PASSWORD_RESET_REQUEST', title: 't', body: 'b' });
    expect(createNotification).not.toHaveBeenCalled();
  });
});

/**
 * The account's notify-me switch (Settings → Notifications, all three roles).
 *
 * The rule these guard: OFF mutes, it does not discard. A muted admin still has
 * the password-reset request waiting when they open the notification centre —
 * only the badge and the push are suppressed. Anything that starts dropping
 * rows at the write path has broken the setting, not implemented it.
 */
describe('notification preferences', () => {
  it('reads the switch off the account', async () => {
    findUniqueUser.mockResolvedValue({ notificationsEnabled: false });
    await expect(getPreferences('u1')).resolves.toEqual({ notificationsEnabled: false });
  });

  it('rejects a preference read for a user who does not exist', async () => {
    findUniqueUser.mockResolvedValue(null);
    await expect(getPreferences('ghost')).rejects.toMatchObject({ status: 404 });
  });

  it('writes the change and records it', async () => {
    findUniqueUser.mockResolvedValue({ notificationsEnabled: true });

    await expect(setPreferences('u1', { notificationsEnabled: false })).resolves.toEqual({
      notificationsEnabled: false,
    });

    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { notificationsEnabled: false } }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'NOTIFICATIONS_MUTED' }) }),
    );
  });

  it('does not write or log when the switch is already where it is being set', async () => {
    findUniqueUser.mockResolvedValue({ notificationsEnabled: true });
    await setPreferences('u1', { notificationsEnabled: true });
    expect(updateUser).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});

describe('unreadCount — the badge', () => {
  it('counts unread notifications for an account that is notified', async () => {
    findUniqueUser.mockResolvedValue({ notificationsEnabled: true });
    countNotification.mockResolvedValue(3);
    await expect(unreadCount('u1')).resolves.toBe(3);
  });

  it('is zero while the account is muted', async () => {
    findUniqueUser.mockResolvedValue({ notificationsEnabled: false });
    countNotification.mockResolvedValue(3);

    await expect(unreadCount('u1')).resolves.toBe(0);
    // The rows are still there — muting is not deletion, and the notification
    // centre must still be able to list them.
    expect(countNotification).not.toHaveBeenCalled();
  });

  it('still writes notifications for a muted user', async () => {
    findUniqueUser.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE', notificationsEnabled: false });
    await notify({ recipientUserId: 'u1', type: 'PASSWORD_RESET_REQUEST', title: 't', body: 'b' });
    expect(createNotification).toHaveBeenCalledOnce();
  });
});
