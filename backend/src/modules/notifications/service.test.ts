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
const createNotification = vi.fn();

vi.mock('../../prisma.js', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      findMany: (...a: unknown[]) => findManyUser(...a),
    },
    notification: { create: (...a: unknown[]) => createNotification(...a) },
  },
}));

const { notify, notifyAllAdmins } = await import('./service.js');

beforeEach(() => {
  vi.clearAllMocks();
  createNotification.mockResolvedValue({});
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
