import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../types/express.js';
import { AppError } from '../../lib/errors.js';

/**
 * Group and individual entries inside a moment (024).
 *
 * Two things are worth pinning here, and neither is the database:
 *
 *   The shape a form becomes. One filled-in form is either an entry per child or
 *   a single shared one, and getting that wrong is silent — twelve near-identical
 *   cards look plausible enough that nobody reports it.
 *
 *   What a family is allowed to see. A group entry names everyone in it, so the
 *   narrowing that keeps one family's copy free of another family's children is
 *   load-bearing rather than cosmetic. The count survives the narrowing; the
 *   names do not.
 *
 * Prisma is mocked: what is under test is the decision, not the query planner.
 */

const collectionFindUnique = vi.fn();
const entryStudentFindMany = vi.fn();
const entryCreate = vi.fn();
const entryFindFirst = vi.fn();
const entryUpdate = vi.fn();
const memberDeleteMany = vi.fn();
const memberCreateMany = vi.fn();
const linkDeleteMany = vi.fn();
const transaction = vi.fn();
const readableStudentIds = vi.fn();

const tx = {
  momentEntry: { update: (...a: unknown[]) => entryUpdate(...a) },
  momentEntryStudent: {
    deleteMany: (...a: unknown[]) => memberDeleteMany(...a),
    createMany: (...a: unknown[]) => memberCreateMany(...a),
  },
  momentEntryLink: { deleteMany: (...a: unknown[]) => linkDeleteMany(...a), createMany: vi.fn() },
};

vi.mock('../../prisma.js', () => ({
  prisma: {
    momentCollection: { findUnique: (...a: unknown[]) => collectionFindUnique(...a) },
    momentEntryStudent: { findMany: (...a: unknown[]) => entryStudentFindMany(...a) },
    momentEntry: {
      create: (...a: unknown[]) => entryCreate(...a),
      findFirst: (...a: unknown[]) => entryFindFirst(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

vi.mock('../../auth/guards.js', () => ({
  readableStudentIds: (...a: unknown[]) => readableStudentIds(...a),
}));

vi.mock('../../lib/audit.js', () => ({ audit: vi.fn() }));

vi.mock('../../lib/storage.js', () => ({
  storage: { createUploadUrl: vi.fn() },
  signMany: async () => new Map<string, string>(),
  signAvatar: async () => null,
}));

const { addEntries, getCollection, updateEntry } = await import('./collections.service.js');
const { createMomentEntrySchema } = await import('@vig/shared');

// --- Fixtures ----------------------------------------------------------------

const ADMIN: AuthContext = {
  userId: 'admin-1',
  username: 'admin',
  fullName: 'An Admin',
  role: 'ADMIN',
  mustChangePassword: false,
  teacherId: null,
  parentId: null,
};

const TEACHER: AuthContext = { ...ADMIN, userId: 'teacher-1', role: 'TEACHER', teacherId: 't-1' };
const PARENT: AuthContext = { ...ADMIN, userId: 'parent-1', role: 'PARENT', parentId: 'p-1' };

const student = (id: string, fullName: string) => ({
  studentId: id,
  student: { id, fullName, avatarPath: null },
});

/** A collection row shaped like `collectionInclude` returns it. */
function collectionRow(entries: unknown[]) {
  return {
    id: 'moment-1',
    heading: 'Clay week',
    description: null,
    startDate: new Date('2026-08-03T00:00:00.000Z'),
    endDate: new Date('2026-08-07T00:00:00.000Z'),
    subjectId: 'subject-1',
    coverPath: null,
    createdBy: 'teacher-1',
    createdAt: new Date('2026-08-03T00:00:00.000Z'),
    subject: { id: 'subject-1', name: 'Art', colorToken: 'violet' },
    creator: { id: 'teacher-1', fullName: 'A Teacher' },
    entries,
  };
}

function entryRow(id: string, kind: 'INDIVIDUAL' | 'GROUP', students: unknown[]) {
  return {
    id,
    collectionId: 'moment-1',
    kind,
    title: 'Built the model',
    description: null,
    photoPath: null,
    videoUrl: 'https://video.example/1',
    createdBy: 'teacher-1',
    createdAt: new Date('2026-08-04T00:00:00.000Z'),
    updatedAt: new Date('2026-08-04T00:00:00.000Z'),
    students,
    creator: { fullName: 'A Teacher' },
    links: [],
  };
}

const form = {
  title: 'Built the model',
  description: undefined,
  photoPath: undefined,
  videoUrl: 'https://video.example/1',
  referenceLinks: [] as Array<{ label?: string; url: string }>,
};

/**
 * `addEntries` reads the collection twice — once for the permission check, then
 * again through `getCollection` for the response — so the mock answers by what
 * the caller asked for rather than by call order.
 */
function mockCollection(entries: unknown[] = []) {
  collectionFindUnique.mockImplementation((args: { select?: unknown }) =>
    args.select ? { createdBy: 'teacher-1' } : collectionRow(entries),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  entryCreate.mockImplementation((args: unknown) => args);
  transaction.mockImplementation((run: (t: unknown) => unknown) => Promise.resolve(run(tx)));
  entryStudentFindMany.mockResolvedValue([]);
});

// --- The contract the form is held to ----------------------------------------

describe('createMomentEntrySchema', () => {
  const body = { title: 'Built the model', videoUrl: 'https://video.example/1' };
  const ONE = '11111111-1111-4111-8111-111111111111';
  const TWO = '22222222-2222-4222-8222-222222222222';

  it('defaults to an individual entry when no kind is sent', () => {
    const parsed = createMomentEntrySchema.parse({ ...body, studentIds: [ONE] });
    expect(parsed.kind).toBe('INDIVIDUAL');
  });

  it('refuses an individual entry naming more than one child', () => {
    const result = createMomentEntrySchema.safeParse({
      ...body,
      kind: 'INDIVIDUAL',
      studentIds: [ONE, TWO],
    });
    expect(result.success).toBe(false);
  });

  it('refuses a group of one', () => {
    const result = createMomentEntrySchema.safeParse({
      ...body,
      kind: 'GROUP',
      studentIds: [ONE],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a group of two', () => {
    const result = createMomentEntrySchema.safeParse({
      ...body,
      kind: 'GROUP',
      studentIds: [ONE, TWO],
    });
    expect(result.success).toBe(true);
  });
});

// --- What the form becomes ---------------------------------------------------

describe('addEntries', () => {
  it('writes one entry for one child when the form is individual', async () => {
    mockCollection();
    readableStudentIds.mockResolvedValue('ALL');

    await addEntries(ADMIN, 'moment-1', { ...form, kind: 'INDIVIDUAL', studentIds: ['s-1'] });

    expect(entryCreate).toHaveBeenCalledTimes(1);
    const { data } = entryCreate.mock.calls[0]![0];
    expect(data.kind).toBe('INDIVIDUAL');
    expect(data.students.create).toEqual([{ studentId: 's-1', collectionId: 'moment-1' }]);
  });

  it('writes a single shared entry when the form is a group', async () => {
    mockCollection();
    readableStudentIds.mockResolvedValue('ALL');

    await addEntries(ADMIN, 'moment-1', {
      ...form,
      kind: 'GROUP',
      studentIds: ['s-1', 's-2', 's-3'],
    });

    expect(entryCreate).toHaveBeenCalledTimes(1);
    const { data } = entryCreate.mock.calls[0]![0];
    expect(data.kind).toBe('GROUP');
    expect(data.students.create).toHaveLength(3);
  });

  it('carries the collection onto every membership row, so uniqueness can bite', async () => {
    mockCollection();
    readableStudentIds.mockResolvedValue('ALL');

    await addEntries(ADMIN, 'moment-1', { ...form, kind: 'GROUP', studentIds: ['s-1', 's-2'] });

    const members = entryCreate.mock.calls[0]![0].data.students.create;
    expect(members).toEqual([
      { studentId: 's-1', collectionId: 'moment-1' },
      { studentId: 's-2', collectionId: 'moment-1' },
    ]);
  });

  it('lets a child already in a group entry also get one of their own', async () => {
    // The Independence Day case: they danced with the group, and they also gave
    // the speech. Two entries, one child, one moment (025).
    mockCollection();
    readableStudentIds.mockResolvedValue('ALL');
    entryStudentFindMany.mockResolvedValue([{ student: { fullName: 'Aarav Shah' } }]);

    await addEntries(ADMIN, 'moment-1', { ...form, kind: 'INDIVIDUAL', studentIds: ['s-1'] });

    expect(entryCreate).toHaveBeenCalledTimes(1);
    expect(entryCreate.mock.calls[0]![0].data.students.create).toEqual([
      { studentId: 's-1', collectionId: 'moment-1' },
    ]);
  });

  it('lets the same child join a second group in the same moment', async () => {
    mockCollection();
    readableStudentIds.mockResolvedValue('ALL');

    await addEntries(ADMIN, 'moment-1', { ...form, kind: 'GROUP', studentIds: ['s-1', 's-2'] });

    expect(entryCreate).toHaveBeenCalledTimes(1);
    expect(entryCreate.mock.calls[0]![0].data.kind).toBe('GROUP');
  });

  it('refuses a group containing a child outside the author’s scope', async () => {
    mockCollection();
    readableStudentIds.mockResolvedValue(['s-1']);

    await expect(
      addEntries(TEACHER, 'moment-1', { ...form, kind: 'GROUP', studentIds: ['s-1', 's-9'] }),
    ).rejects.toBeInstanceOf(AppError);
    expect(entryCreate).not.toHaveBeenCalled();
  });

  it('collapses a child sent twice by "select all" plus a stray click', async () => {
    mockCollection();
    readableStudentIds.mockResolvedValue('ALL');

    await addEntries(ADMIN, 'moment-1', {
      ...form,
      kind: 'GROUP',
      studentIds: ['s-1', 's-2', 's-1'],
    });

    expect(entryCreate.mock.calls[0]![0].data.students.create).toHaveLength(2);
  });
});

// --- Fixing a roster afterwards ----------------------------------------------

describe('updateEntry', () => {
  const media = { title: 'Built the model', videoUrl: 'https://video.example/1' };

  /** An entry as `updateEntry` selects it, with the roster it currently has. */
  function mockEntry(kind: 'INDIVIDUAL' | 'GROUP', studentIds: string[]) {
    mockCollection();
    entryFindFirst.mockResolvedValue({
      id: 'entry-1',
      kind,
      photoPath: null,
      videoUrl: 'https://video.example/1',
      students: studentIds.map((studentId) => ({ studentId })),
      collection: { createdBy: 'teacher-1' },
    });
  }

  it('adds the child who was left out and removes the one who was not there', async () => {
    mockEntry('GROUP', ['s-1', 's-2']);
    readableStudentIds.mockResolvedValue('ALL');

    await updateEntry(ADMIN, 'moment-1', 'entry-1', {
      ...media,
      studentIds: ['s-1', 's-3'],
    });

    // Only the difference is written — s-1 was already in and is left alone.
    expect(memberDeleteMany).toHaveBeenCalledWith({
      where: { entryId: 'entry-1', studentId: { in: ['s-2'] } },
    });
    expect(memberCreateMany).toHaveBeenCalledWith({
      data: [{ entryId: 'entry-1', studentId: 's-3', collectionId: 'moment-1' }],
    });
  });

  it('leaves the roster alone when the edit does not mention it', async () => {
    mockEntry('GROUP', ['s-1', 's-2']);
    readableStudentIds.mockResolvedValue('ALL');

    await updateEntry(ADMIN, 'moment-1', 'entry-1', { title: 'A better title' });

    expect(memberDeleteMany).not.toHaveBeenCalled();
    expect(memberCreateMany).not.toHaveBeenCalled();
    expect(entryUpdate).toHaveBeenCalled();
  });

  it('refuses to move an individual entry to a different child', async () => {
    mockEntry('INDIVIDUAL', ['s-1']);
    readableStudentIds.mockResolvedValue('ALL');

    await expect(
      updateEntry(ADMIN, 'moment-1', 'entry-1', { ...media, studentIds: ['s-2'] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(memberDeleteMany).not.toHaveBeenCalled();
  });

  it('refuses to shrink a group below two, rather than leaving a group of one', async () => {
    mockEntry('GROUP', ['s-1', 's-2']);
    readableStudentIds.mockResolvedValue('ALL');

    await expect(
      updateEntry(ADMIN, 'moment-1', 'entry-1', { ...media, studentIds: ['s-1'] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(memberDeleteMany).not.toHaveBeenCalled();
  });

  it('refuses to add a child the editor cannot see', async () => {
    mockEntry('GROUP', ['s-1', 's-2']);
    readableStudentIds.mockResolvedValue(['s-1', 's-2']);

    await expect(
      updateEntry(TEACHER, 'moment-1', 'entry-1', { ...media, studentIds: ['s-1', 's-2', 's-9'] }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('lets an editor remove a child they cannot see, having inherited them', async () => {
    // Removal is not gated on scope: the alternative is a roster nobody can fix,
    // and the whole entry was already theirs to delete.
    mockEntry('GROUP', ['s-1', 's-2', 's-9']);
    readableStudentIds.mockResolvedValue(['s-1', 's-2']);

    await updateEntry(TEACHER, 'moment-1', 'entry-1', { ...media, studentIds: ['s-1', 's-2'] });

    expect(memberDeleteMany).toHaveBeenCalledWith({
      where: { entryId: 'entry-1', studentId: { in: ['s-9'] } },
    });
  });

  it('adds a child who is already in another entry of the moment', async () => {
    mockEntry('GROUP', ['s-1', 's-2']);
    readableStudentIds.mockResolvedValue('ALL');
    // s-3 gave the solo speech; they can be in the choir as well (025).
    entryStudentFindMany.mockResolvedValue([{ student: { fullName: 'Chetan Iyer' } }]);

    await updateEntry(ADMIN, 'moment-1', 'entry-1', {
      ...media,
      studentIds: ['s-1', 's-2', 's-3'],
    });

    expect(memberCreateMany).toHaveBeenCalledWith({
      data: [{ entryId: 'entry-1', studentId: 's-3', collectionId: 'moment-1' }],
    });
  });
});

// --- What each role is shown -------------------------------------------------

describe('getCollection', () => {
  const groupOfThree = () =>
    entryRow('entry-1', 'GROUP', [
      student('s-1', 'Aarav Shah'),
      student('s-2', 'Bela Rao'),
      student('s-3', 'Chetan Iyer'),
    ]);

  it('gives staff the whole roster of a group entry', async () => {
    mockCollection([groupOfThree()]);
    readableStudentIds.mockResolvedValue('ALL');

    const moment = await getCollection(ADMIN, 'moment-1');

    expect(moment.entries).toHaveLength(1);
    expect(moment.entries[0]!.students.map((s) => s.fullName)).toEqual([
      'Aarav Shah',
      'Bela Rao',
      'Chetan Iyer',
    ]);
    expect(moment.entries[0]!.studentCount).toBe(3);
  });

  it('names a child once in the summary though they are in several entries', async () => {
    // Their group dance and their solo speech are two entries; "who took part"
    // is still one name (025).
    mockCollection([
      entryRow('entry-1', 'GROUP', [student('s-1', 'Aarav Shah'), student('s-2', 'Bela Rao')]),
      entryRow('entry-2', 'INDIVIDUAL', [student('s-1', 'Aarav Shah')]),
    ]);
    readableStudentIds.mockResolvedValue('ALL');

    const moment = await getCollection(ADMIN, 'moment-1');

    expect(moment.studentNames).toEqual(['Aarav Shah', 'Bela Rao']);
    // The entry count still counts entries, not children.
    expect(moment.entryCount).toBe(2);
  });

  it('gives a parent the group entry, their own child, and a count of the rest', async () => {
    mockCollection([groupOfThree()]);
    readableStudentIds.mockResolvedValue(['s-2']);

    const moment = await getCollection(PARENT, 'moment-1');

    // The moment is reachable — a group is not a reason to hide it from a family
    // whose child is in it.
    expect(moment.entries).toHaveLength(1);
    // But the other two children are not named anywhere in the response.
    expect(moment.entries[0]!.students.map((s) => s.fullName)).toEqual(['Bela Rao']);
    expect(moment.studentNames).toEqual(['Bela Rao']);
    // The total survives, so the card can say "and 2 others" honestly.
    expect(moment.entries[0]!.studentCount).toBe(3);
    expect(JSON.stringify(moment)).not.toContain('Aarav');
  });

  it('drops the entries a parent’s child is not in, and keeps the ones they are', async () => {
    mockCollection([
      entryRow('entry-1', 'INDIVIDUAL', [student('s-1', 'Aarav Shah')]),
      entryRow('entry-2', 'GROUP', [student('s-2', 'Bela Rao'), student('s-3', 'Chetan Iyer')]),
    ]);
    readableStudentIds.mockResolvedValue(['s-2']);

    const moment = await getCollection(PARENT, 'moment-1');

    expect(moment.entries.map((e) => e.id)).toEqual(['entry-2']);
    expect(moment.entryCount).toBe(1);
  });

  it('refuses a parent whose child is in none of the entries', async () => {
    mockCollection([groupOfThree()]);
    readableStudentIds.mockResolvedValue(['s-9']);

    await expect(getCollection(PARENT, 'moment-1')).rejects.toMatchObject({ status: 403 });
  });

  it('refuses a teacher who did not open the moment, group entries or not', async () => {
    mockCollection([groupOfThree()]);
    readableStudentIds.mockResolvedValue('ALL');

    await expect(
      getCollection({ ...TEACHER, userId: 'teacher-2' }, 'moment-1'),
    ).rejects.toMatchObject({ status: 403 });
  });
});
