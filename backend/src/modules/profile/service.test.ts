import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contactPatch } from '../../lib/contact.js';

/**
 * A person maintaining their own record.
 *
 * Two things have to hold, and both are security properties rather than
 * conveniences: the write lands on the caller's own row and nobody else's, and
 * the fields the school issues — name, username, role — are not writable from
 * here whatever the request body says.
 */

const user = { findUnique: vi.fn(), update: vi.fn() };
const teacher = { update: vi.fn() };
const parent = { update: vi.fn() };

vi.mock('../../prisma.js', () => ({
  prisma: {
    user,
    teacher,
    parent,
    $transaction: (fn: (tx: unknown) => unknown) => fn({ user, teacher, parent }),
  },
}));
vi.mock('../../lib/audit.js', () => ({ audit: vi.fn() }));
vi.mock('../../lib/storage.js', () => ({
  signAvatar: vi.fn().mockResolvedValue(null),
  avatarStorage: { createUploadUrl: vi.fn(), remove: vi.fn() },
}));

const { updateMyProfile } = await import('./service.js');

const TEACHER_ROW = {
  id: 'u1',
  username: 'T26PriSha',
  fullName: 'Priya Sharma',
  role: 'TEACHER',
  language: 'en',
  avatarPath: null,
  teacher: { id: 't1', firstName: 'Priya', lastName: 'Sharma' },
  parent: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  user.findUnique.mockResolvedValue(TEACHER_ROW);
});

describe('contactPatch', () => {
  it('leaves out a field that was not sent', () => {
    expect(contactPatch({ email: 'priya@example.com' })).toEqual({ email: 'priya@example.com' });
  });

  it('clears a field that was sent empty', () => {
    expect(contactPatch({ mobileNumber: '' })).toEqual({ mobileNumber: null });
  });

  it('trims what it stores', () => {
    expect(contactPatch({ bloodGroup: ' O+ ' })).toEqual({ bloodGroup: 'O+' });
  });
});

describe('updateMyProfile', () => {
  it('writes the contact block to the caller own teacher row', async () => {
    await updateMyProfile('u1', { email: 'priya@example.com', address: '14 MG Road' });

    expect(teacher.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { email: 'priya@example.com', address: '14 MG Road' },
    });
    expect(parent.update).not.toHaveBeenCalled();
  });

  it('cannot reach another person record', async () => {
    // The id comes from the session; a body cannot redirect the write.
    await updateMyProfile('u1', { email: 'a@b.com', userId: 'someone-else' } as never);

    expect(user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    expect(teacher.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' } }));
  });

  it('never writes the name, username or role', async () => {
    await updateMyProfile('u1', {
      fullName: 'Someone Else',
      firstName: 'Someone',
      username: 'admin',
      role: 'ADMIN',
      email: 'priya@example.com',
    } as never);

    expect(teacher.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { email: 'priya@example.com' },
    });
    // Only language reaches the user row, and only when it was sent.
    expect(user.update).not.toHaveBeenCalled();
  });

  it('saves the language against the user row', async () => {
    await updateMyProfile('u1', { language: 'te' });

    expect(user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { language: 'te' } });
  });

  it('writes to the parent row for a parent', async () => {
    user.findUnique.mockResolvedValue({
      ...TEACHER_ROW,
      role: 'PARENT',
      teacher: null,
      parent: { id: 'p1', firstName: 'Nagaraju', lastName: 'Vengaldasu' },
    });

    await updateMyProfile('u1', { mobileNumber: '+91 98765 43210' });

    expect(parent.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { mobileNumber: '+91 98765 43210' },
    });
    expect(teacher.update).not.toHaveBeenCalled();
  });

  it('touches no person row for an administrator', async () => {
    user.findUnique.mockResolvedValue({ ...TEACHER_ROW, role: 'ADMIN', teacher: null, parent: null });

    await updateMyProfile('u1', { email: 'admin@example.com' });

    expect(teacher.update).not.toHaveBeenCalled();
    expect(parent.update).not.toHaveBeenCalled();
  });
});
