import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../types/express.js';

/**
 * Resource-scoped authorization (spec §2).
 *
 * Role checks alone are not enough — a teacher holds the TEACHER role for every
 * teacher's data. These tests pin the scoping itself: that a parent cannot reach
 * an unlinked child (BR-13), that a teacher cannot reach an unassigned class,
 * and — the failure mode that actually leaks data — that the constraint is in
 * the query rather than applied afterwards.
 *
 * Prisma is mocked: the rule under test is the authorization decision, not the
 * database.
 */

const findFirstOccurrence = vi.fn();
const findFirstParentStudent = vi.fn();
const findManyParentStudent = vi.fn();
const findFirstClassStudent = vi.fn();
const findManyClassStudent = vi.fn();

vi.mock('../prisma.js', () => ({
  prisma: {
    classOccurrence: { findFirst: (...a: unknown[]) => findFirstOccurrence(...a) },
    parentStudent: {
      findFirst: (...a: unknown[]) => findFirstParentStudent(...a),
      findMany: (...a: unknown[]) => findManyParentStudent(...a),
    },
    classStudent: {
      findFirst: (...a: unknown[]) => findFirstClassStudent(...a),
      findMany: (...a: unknown[]) => findManyClassStudent(...a),
    },
  },
}));

const {
  assertCanReadStudent,
  assertParentLinkedToStudent,
  assertTeacherOwnsOccurrence,
  readableStudentIds,
} = await import('./guards.js');

function ctx(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'user-1',
    username: 'user',
    fullName: 'A User',
    role: 'TEACHER',
    mustChangePassword: false,
    teacherId: null,
    parentId: null,
    ...overrides,
  };
}

const ADMIN = ctx({ role: 'ADMIN' });
const PRIYA = ctx({ role: 'TEACHER', teacherId: 'teacher-priya' });
const PARENT = ctx({ role: 'PARENT', parentId: 'parent-ananya' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertTeacherOwnsOccurrence', () => {
  it('lets an admin through without querying', async () => {
    await expect(assertTeacherOwnsOccurrence(ADMIN, 'occ-1')).resolves.toBeUndefined();
    expect(findFirstOccurrence).not.toHaveBeenCalled();
  });

  it('allows a teacher their own occurrence', async () => {
    findFirstOccurrence.mockResolvedValue({ id: 'occ-1' });
    await expect(assertTeacherOwnsOccurrence(PRIYA, 'occ-1')).resolves.toBeUndefined();
  });

  it('rejects an occurrence assigned to someone else', async () => {
    findFirstOccurrence.mockResolvedValue(null);
    await expect(assertTeacherOwnsOccurrence(PRIYA, 'occ-9')).rejects.toThrow(
      /not assigned to you/i,
    );
  });

  it('scopes by teacherId inside the query, not after it', async () => {
    findFirstOccurrence.mockResolvedValue({ id: 'occ-1' });
    await assertTeacherOwnsOccurrence(PRIYA, 'occ-1');

    expect(findFirstOccurrence).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'occ-1', teacherId: 'teacher-priya' }),
      }),
    );
  });

  it('rejects a parent outright', async () => {
    await expect(assertTeacherOwnsOccurrence(PARENT, 'occ-1')).rejects.toThrow();
  });

  it('rejects a teacher whose account has no teacher record', async () => {
    await expect(
      assertTeacherOwnsOccurrence(ctx({ role: 'TEACHER', teacherId: null }), 'occ-1'),
    ).rejects.toThrow();
  });
});

describe('assertParentLinkedToStudent — BR-13', () => {
  it('allows a linked child', async () => {
    findFirstParentStudent.mockResolvedValue({ studentId: 'aarav' });
    await expect(assertParentLinkedToStudent(PARENT, 'aarav')).resolves.toBeUndefined();
  });

  it('rejects an unlinked child', async () => {
    findFirstParentStudent.mockResolvedValue(null);
    await expect(assertParentLinkedToStudent(PARENT, 'someone-else')).rejects.toThrow(
      /do not have access/i,
    );
  });

  it('scopes by parentId inside the query', async () => {
    findFirstParentStudent.mockResolvedValue({ studentId: 'aarav' });
    await assertParentLinkedToStudent(PARENT, 'aarav');

    expect(findFirstParentStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ parentId: 'parent-ananya', studentId: 'aarav' }),
      }),
    );
  });

  it('rejects a caller with no parent record rather than falling open', async () => {
    await expect(assertParentLinkedToStudent(ctx({ role: 'PARENT' }), 'aarav')).rejects.toThrow();
    expect(findFirstParentStudent).not.toHaveBeenCalled();
  });
});

describe('assertCanReadStudent', () => {
  it('admin may read any student', async () => {
    await expect(assertCanReadStudent(ADMIN, 'anyone')).resolves.toBeUndefined();
  });

  it('teacher may read a student they teach', async () => {
    findFirstClassStudent.mockResolvedValue({ studentId: 'aarav' });
    await expect(assertCanReadStudent(PRIYA, 'aarav')).resolves.toBeUndefined();
  });

  it('teacher may not read a student they do not teach', async () => {
    findFirstClassStudent.mockResolvedValue(null);
    await expect(assertCanReadStudent(PRIYA, 'stranger')).rejects.toThrow(
      /not in any of your classes/i,
    );
  });

  it('parent is routed through the linked-child check', async () => {
    findFirstParentStudent.mockResolvedValue(null);
    await expect(assertCanReadStudent(PARENT, 'stranger')).rejects.toThrow();
    expect(findFirstParentStudent).toHaveBeenCalled();
  });

  it('denies a role with no scoping path', async () => {
    await expect(
      assertCanReadStudent(ctx({ role: 'TEACHER', teacherId: null }), 'aarav'),
    ).rejects.toThrow();
  });
});

describe('readableStudentIds — list scoping', () => {
  it('returns ALL only for an admin', async () => {
    await expect(readableStudentIds(ADMIN)).resolves.toBe('ALL');
  });

  it('returns just the linked children for a parent', async () => {
    findManyParentStudent.mockResolvedValue([{ studentId: 'aarav' }, { studentId: 'diya' }]);
    await expect(readableStudentIds(PARENT)).resolves.toEqual(['aarav', 'diya']);
  });

  it('returns only students in the teacher’s own classes', async () => {
    findManyClassStudent.mockResolvedValue([{ studentId: 'aarav' }]);
    await expect(readableStudentIds(PRIYA)).resolves.toEqual(['aarav']);

    expect(findManyClassStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ class: { teacherId: 'teacher-priya' } }),
      }),
    );
  });

  it('returns an empty set — never ALL — when scoping cannot be established', async () => {
    // The dangerous failure would be falling through to 'ALL'.
    await expect(readableStudentIds(ctx({ role: 'PARENT' }))).resolves.toEqual([]);
    await expect(readableStudentIds(ctx({ role: 'TEACHER' }))).resolves.toEqual([]);
  });
});
