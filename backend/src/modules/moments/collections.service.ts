import type { Prisma } from '@prisma/client';
import type {
  CreateMomentCollectionInput,
  CreateMomentEntryInput,
  MomentCollectionDetailDto,
  MomentCollectionDto,
  MomentEntryDto,
  MomentEntryKind,
  MomentFolderDto,
  MomentStudentOptionDto,
  MomentSubjectOptionDto,
  StudentMomentEntryDto,
} from '@vig/shared';
import {
  isOthersFolder,
  OTHERS_FOLDER_ID,
  OTHERS_FOLDER_NAME,
  OTHERS_FOLDER_TOKEN,
} from '@vig/shared';
import { prisma } from '../../prisma.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { signAvatar, signMany, storage } from '../../lib/storage.js';
import { readableStudentIds } from '../../auth/guards.js';
import type { AuthContext } from '../../types/express.js';

/**
 * Moments, as staff actually author them.
 *
 * A moment is opened once — a heading, why it matters, the period it covers and
 * the subject it sits under — and then filled in. Each entry carries a photo, a
 * video link, its own title and description, and any reference links worth
 * keeping.
 *
 * An entry is written for one child or for a group (024). An individual entry is
 * one child's own card, editable and removable without touching anyone else's; a
 * group entry is a single card naming everyone in it, because "they built the
 * model together" is one thing that happened rather than twelve. Either way the
 * audience lives in `moment_entry_students`.
 *
 * A child may be in as many entries of a moment as they took part in (025). One
 * Independence Day is one moment, and the same child dances in a group, speaks
 * on their own and sings in the choir — so nothing here treats a second entry
 * for the same child as a mistake.
 *
 * Moments live in folders — one per curriculum subject, plus "Others" for what
 * belongs to the school rather than to a subject. Others is stored as no subject
 * at all (022) and is the admin's alone: only they may file into it, and only
 * they may read what is inside.
 *
 * Who sees what:
 *   Admin    every moment, whoever opened it, in every folder including Others.
 *   Teacher  the ones they opened themselves, filed under a subject they hold
 *            the capability for. Never Others.
 *   Parent   any moment their child appears in, individual or group — and inside
 *            it, only the entries their own child is in, with only their own
 *            child named. A parent never learns which other children were there,
 *            which is why the entry filter below is not cosmetic, and why a
 *            group entry reaches them as "your child and eleven others" rather
 *            than as a roster. Never Others.
 */

/** The folder a moment with no subject sits in. Not a row in `subjects` (022). */
const OTHERS_FOLDER = {
  id: OTHERS_FOLDER_ID,
  name: OTHERS_FOLDER_NAME,
  colorToken: OTHERS_FOLDER_TOKEN,
} as const;

const collectionInclude = {
  subject: { select: { id: true, name: true, colorToken: true } },
  creator: { select: { id: true, fullName: true } },
  entries: {
    orderBy: { createdAt: 'asc' },
    include: {
      // Alphabetical, so a group entry reads as a class list rather than in
      // whatever order the author happened to tick the boxes.
      students: {
        orderBy: { student: { fullName: 'asc' } },
        select: {
          studentId: true,
          student: { select: { id: true, fullName: true, avatarPath: true } },
        },
      },
      creator: { select: { fullName: true } },
      links: { orderBy: { displayOrder: 'asc' } },
    },
  },
} satisfies Prisma.MomentCollectionInclude;

type CollectionRow = Prisma.MomentCollectionGetPayload<{ include: typeof collectionInclude }>;

/** An entry as one caller may read it: the names they may see, and the true total. */
type VisibleEntry = CollectionRow['entries'][number] & { studentCount: number };

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const atUtcMidnight = (key: string) => new Date(`${key}T00:00:00.000Z`);

/**
 * A parent's copy of a moment, narrowed twice over.
 *
 * Entries their children are not in drop out entirely; the ones that remain keep
 * only their own children's names, so a group of twelve reaches a family as
 * their own child plus a count. Everyone else sees the whole thing. Applied
 * before any mapping, so a name belonging to another family never reaches a DTO
 * in the first place.
 *
 * `studentCount` is taken before the narrowing and is the honest total — the
 * card can say "and 11 others" without being able to name one of them.
 */
function visibleEntries(row: CollectionRow, scope: string[] | 'ALL'): VisibleEntry[] {
  return row.entries
    .map((e) => ({
      ...e,
      studentCount: e.students.length,
      students: scope === 'ALL' ? e.students : e.students.filter((s) => scope.includes(s.studentId)),
    }))
    .filter((e) => e.students.length > 0);
}

/** A moment is the creator's to change, and the admin's. Nobody else's. */
function canManage(row: { createdBy: string }, ctx: AuthContext): boolean {
  return ctx.role === 'ADMIN' || row.createdBy === ctx.userId;
}

function assertCanManage(row: { createdBy: string }, ctx: AuthContext): void {
  if (!canManage(row, ctx)) throw forbidden('This moment was created by someone else.');
}

async function toEntryDto(
  entries: VisibleEntry[],
  photoUrls: Map<string, string>,
): Promise<MomentEntryDto[]> {
  return Promise.all(
    entries.map(async (e) => ({
      id: e.id,
      kind: e.kind,
      students: await Promise.all(
        e.students.map(async ({ student }) => ({
          id: student.id,
          fullName: student.fullName,
          avatarUrl: await signAvatar(student.avatarPath),
        })),
      ),
      studentCount: e.studentCount,
      title: e.title,
      description: e.description,
      photoUrl: e.photoPath ? (photoUrls.get(e.photoPath) ?? null) : null,
      videoUrl: e.videoUrl,
      referenceLinks: e.links.map((l) => ({ id: l.id, label: l.label, url: l.url })),
      createdByName: e.creator.fullName,
      createdAt: e.createdAt.toISOString(),
    })),
  );
}

function toSummary(
  row: CollectionRow,
  entries: VisibleEntry[],
  photoUrls: Map<string, string>,
  ctx: AuthContext,
): MomentCollectionDto {
  return {
    id: row.id,
    heading: row.heading,
    description: row.description,
    startDate: dateKey(row.startDate),
    endDate: dateKey(row.endDate),
    // No subject means the Others folder, which the API names rather than the
    // database — nothing above this line needs to know about the null.
    subject: row.subject ?? OTHERS_FOLDER,
    createdBy: { id: row.creator.id, name: row.creator.fullName },
    canManage: canManage(row, ctx),
    entryCount: entries.length,
    // The moment's own cover, never a mosaic of the children's entry photos —
    // browse chrome should not be built out of individual children (023).
    coverPhotoUrl: row.coverPath ? (photoUrls.get(row.coverPath) ?? null) : null,
    // Who was in this moment, each named once. A child may be in several of its
    // entries — the speech and the group dance — and the summary line answers
    // "who took part", not "how many times" (025).
    studentNames: [
      ...new Map(
        entries.flatMap((e) => e.students.map((s) => [s.student.id, s.student.fullName] as const)),
      ).values(),
    ],
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The predicate for "moments this caller may see", in one place.
 *
 * The scope is pushed into the query rather than filtered afterwards, so a
 * teacher's list is never assembled from rows they had no business reading (§2).
 * Both the folder counts and the folder contents run through here, so the number
 * on a card and the list behind it can never disagree.
 */
function visibilityWhere(
  ctx: AuthContext,
  scope: string[] | 'ALL',
  filters: { studentId?: string; folderId?: string; from?: string; to?: string },
): Prisma.MomentCollectionWhereInput {
  const wantsOthers = isOthersFolder(filters.folderId);
  if (wantsOthers && ctx.role !== 'ADMIN') {
    throw forbidden('That folder is only visible to an administrator.');
  }

  const where: Prisma.MomentCollectionWhereInput = {};

  // Containment, not overlap: a moment matches when its own span sits wholly
  // inside the dates asked for. Searching 5–6 August therefore does not drag in
  // a moment that ran all month and happened to cross those two days.
  //
  // Each bound stands on its own, so "from 1 August" means every moment that
  // began on or after it, and "to 31 August" every moment that had finished by
  // then. Nothing is rounded to a month — these are plain day comparisons.
  if (filters.from) where.startDate = { gte: atUtcMidnight(filters.from) };
  if (filters.to) where.endDate = { lte: atUtcMidnight(filters.to) };

  // One key, set once: a real subject, the Others folder, or — for anyone but an
  // admin browsing everything — "any folder except Others".
  if (filters.folderId) {
    where.subjectId = wantsOthers ? null : filters.folderId;
  } else if (ctx.role !== 'ADMIN') {
    where.subjectId = { not: null };
  }

  // "Is this child in this moment" is asked of `entryStudents`, never of the
  // entries themselves — that is the one question a group entry and an
  // individual one have to answer identically (024).
  if (ctx.role === 'TEACHER') {
    // A teacher's moments are the ones they opened. Someone else's moment about
    // the same child is not theirs to browse.
    where.createdBy = ctx.userId;
    if (filters.studentId) where.entryStudents = { some: { studentId: filters.studentId } };
  } else if (ctx.role === 'PARENT') {
    // A parent reaches a moment only through a child of theirs being in it.
    const childIds = scope === 'ALL' ? [] : scope;
    where.entryStudents = {
      some: { studentId: filters.studentId ? filters.studentId : { in: childIds } },
    };
  } else if (filters.studentId) {
    where.entryStudents = { some: { studentId: filters.studentId } };
  }

  return where;
}

/**
 * The folders on the Moments landing page.
 *
 * An admin and a teacher see their subjects whether or not anything is filed
 * under them yet — an empty folder is where the next moment goes, so hiding it
 * would hide the way in. A parent sees only the folders their own children
 * actually appear in; an empty subject card tells a family nothing.
 */
export async function listFolders(
  ctx: AuthContext,
  filters: { studentId?: string } = {},
): Promise<MomentFolderDto[]> {
  const scope = await readableStudentIds(ctx);
  const where = visibilityWhere(ctx, scope, filters);

  const rows = await prisma.momentCollection.findMany({
    where,
    orderBy: { startDate: 'desc' },
    select: {
      subjectId: true,
      startDate: true,
      coverPath: true,
      subject: { select: { id: true, name: true, colorToken: true, displayOrder: true } },
      // Only for counting, and for a parent's own-child filter — no photo paths
      // leave here, so a folder card is never built from children's photos.
      entries: { select: { students: { select: { studentId: true } } } },
    },
  });

  // A teacher's folders are the subjects they may author under; an admin's are
  // the whole curriculum plus Others. Fetched first so an untouched subject
  // still gets a card.
  const shells =
    ctx.role === 'PARENT'
      ? []
      : // Already in curriculum order, so the position in that list *is* the
        // order — no need to carry displayOrder through the option DTO.
        (await listSubjectOptions(ctx)).map((s, index) => ({
          id: s.id,
          name: s.name,
          colorToken: s.colorToken,
          isOthers: s.isOthers,
          displayOrder: index,
        }));

  type Bucket = {
    id: string;
    name: string;
    colorToken: string;
    isOthers: boolean;
    displayOrder: number;
    momentCount: number;
    entryCount: number;
    latestStartDate: string | null;
    photoPaths: string[];
  };

  const buckets = new Map<string, Bucket>();
  const ensure = (seed: Omit<Bucket, 'momentCount' | 'entryCount' | 'latestStartDate' | 'photoPaths'>) => {
    const existing = buckets.get(seed.id);
    if (existing) return existing;
    const fresh: Bucket = {
      ...seed,
      momentCount: 0,
      entryCount: 0,
      latestStartDate: null,
      photoPaths: [],
    };
    buckets.set(seed.id, fresh);
    return fresh;
  };

  for (const shell of shells) ensure(shell);

  for (const row of rows) {
    const bucket = row.subject
      ? ensure({
          id: row.subject.id,
          name: row.subject.name,
          colorToken: row.subject.colorToken,
          isOthers: false,
          displayOrder: row.subject.displayOrder,
        })
      : ensure({ ...OTHERS_FOLDER, isOthers: true, displayOrder: Number.MAX_SAFE_INTEGER });

    // A parent's count is the entries their own child is in, never the whole
    // class — the same filter that keeps other families out of the detail page.
    // A group entry counts once, as one card is what they will find inside.
    const entries =
      scope === 'ALL'
        ? row.entries
        : row.entries.filter((e) => e.students.some((s) => scope.includes(s.studentId)));

    bucket.momentCount += 1;
    bucket.entryCount += entries.length;
    // Rows arrive newest first, so the first one to touch a folder is its
    // latest, and the first three covers are the three most recent.
    bucket.latestStartDate ??= dateKey(row.startDate);
    if (row.coverPath && bucket.photoPaths.length < 3) bucket.photoPaths.push(row.coverPath);
  }

  // One signing pass for the whole page rather than one per card.
  const photoUrls = await signMany([...buckets.values()].flatMap((b) => b.photoPaths));

  return [...buckets.values()]
    .sort(
      (a, b) =>
        // Others is a catch-all, so it sits last however the curriculum is ordered.
        Number(a.isOthers) - Number(b.isOthers) ||
        a.displayOrder - b.displayOrder ||
        a.name.localeCompare(b.name),
    )
    .map(({ photoPaths, displayOrder: _displayOrder, ...folder }) => ({
      ...folder,
      previewPhotoUrls: photoPaths
        .map((path) => photoUrls.get(path))
        .filter((url): url is string => Boolean(url)),
    }));
}

/** The moments inside one folder, or across all of them when none is named. */
export async function listCollections(
  ctx: AuthContext,
  filters: { studentId?: string; subjectId?: string; from?: string; to?: string } = {},
): Promise<MomentCollectionDto[]> {
  const scope = await readableStudentIds(ctx);
  const where = visibilityWhere(ctx, scope, {
    studentId: filters.studentId,
    folderId: filters.subjectId,
    from: filters.from,
    to: filters.to,
  });

  const rows = await prisma.momentCollection.findMany({
    where,
    include: collectionInclude,
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    take: 120,
  });

  // One signing pass for the whole page rather than one per card. Only the
  // covers are needed here — a list never renders an entry's photo.
  const visible = rows.map((row) => ({ row, entries: visibleEntries(row, scope) }));
  const photoUrls = await signMany(
    visible.flatMap(({ row }) => (row.coverPath ? [row.coverPath] : [])),
  );

  return visible.map(({ row, entries }) => toSummary(row, entries, photoUrls, ctx));
}

/**
 * One child's own entries, across every moment they appear in.
 *
 * This is the student profile's answer, and it is a different question from the
 * folder's: not "which moments happened" but "what was written about this
 * child". So what comes back is the entries themselves, each carrying the moment
 * it belongs to rather than being wrapped in it.
 *
 * A group entry belongs on every profile it names, so it appears here for each
 * of them — the same card, not a copy per child.
 *
 * Visibility is the same predicate the folders and the lists use, so a moment a
 * teacher cannot browse does not reappear here through a child they teach — and
 * a parent still sees their own child's entries only.
 */
export async function listStudentEntries(
  ctx: AuthContext,
  studentId: string,
): Promise<StudentMomentEntryDto[]> {
  const scope = await readableStudentIds(ctx);
  const where = visibilityWhere(ctx, scope, { studentId });

  const rows = await prisma.momentCollection.findMany({
    where,
    include: collectionInclude,
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    take: 120,
  });

  // Two filters, and both are load-bearing: the scope keeps another family's
  // child out, and the id narrows a moment full of children down to the entries
  // this child is actually in — their own, and any group they were part of.
  const mine = rows.map((row) => ({
    row,
    entries: visibleEntries(row, scope).filter((e) =>
      e.students.some((s) => s.studentId === studentId),
    ),
  }));

  const photoUrls = await signMany(
    mine.flatMap(({ entries }) => entries.flatMap((e) => (e.photoPath ? [e.photoPath] : []))),
  );

  const out: StudentMomentEntryDto[] = [];
  for (const { row, entries } of mine) {
    const moment = {
      id: row.id,
      heading: row.heading,
      startDate: dateKey(row.startDate),
      endDate: dateKey(row.endDate),
      // No subject means Others, named by the API rather than the database (022).
      subject: row.subject ?? OTHERS_FOLDER,
    };
    for (const dto of await toEntryDto(entries, photoUrls)) out.push({ ...dto, moment });
  }
  return out;
}

export async function getCollection(
  ctx: AuthContext,
  collectionId: string,
): Promise<MomentCollectionDetailDto> {
  const row = await prisma.momentCollection.findUnique({
    where: { id: collectionId },
    include: collectionInclude,
  });
  if (!row) throw notFound('Moment');

  const scope = await readableStudentIds(ctx);
  const entries = visibleEntries(row, scope);

  // The Others folder is the admin's, by the direct link as much as by the list.
  if (row.subjectId === null && ctx.role !== 'ADMIN') {
    throw forbidden('That folder is only visible to an administrator.');
  }

  // A teacher may open their own moments; a parent, one their child is in. An
  // empty visible list for a parent means the child is not in it at all.
  if (ctx.role === 'TEACHER' && row.createdBy !== ctx.userId) {
    throw forbidden('This moment was created by someone else.');
  }
  if (ctx.role === 'PARENT' && entries.length === 0) {
    throw forbidden('This moment does not include your child.');
  }

  const photoUrls = await signMany([
    ...(row.coverPath ? [row.coverPath] : []),
    ...entries.flatMap((e) => (e.photoPath ? [e.photoPath] : [])),
  ]);

  return {
    ...toSummary(row, entries, photoUrls, ctx),
    entries: await toEntryDto(entries, photoUrls),
  };
}

/**
 * The folders a moment may be filed under.
 *
 * An admin picks from the whole curriculum, plus Others for what belongs to no
 * subject. A teacher picks from what they were given to teach (BR-05) — the same
 * capability that decides what they may author anywhere else — and is never
 * offered Others.
 */
export async function listSubjectOptions(ctx: AuthContext): Promise<MomentSubjectOptionDto[]> {
  if (ctx.role === 'TEACHER') {
    if (!ctx.teacherId) return [];
    const capabilities = await prisma.teacherCapability.findMany({
      where: { teacherId: ctx.teacherId, subject: { status: 'ACTIVE' } },
      select: { subject: { select: { id: true, name: true, colorToken: true, displayOrder: true } } },
    });
    return capabilities
      .map((c) => c.subject)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
      .map(({ id, name, colorToken }) => ({ id, name, colorToken, isOthers: false }));
  }

  const subjects = await prisma.subject.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, colorToken: true },
  });

  const options = subjects.map((s) => ({ ...s, isOthers: false }));
  // Last in the list, because it is where a moment goes when none of the real
  // subjects fit — not a first choice.
  if (ctx.role === 'ADMIN') options.push({ ...OTHERS_FOLDER, isOthers: true });
  return options;
}

/**
 * The children who can go into this moment — everyone the caller may see.
 *
 * Each comes back with the entries of this moment they are already in. That is
 * context, not a veto: since 025 a child may be written up as many times in one
 * moment as they took part in it. Knowing they are already in two entries is
 * worth showing; refusing them a third is not.
 */
export async function listStudentOptions(
  ctx: AuthContext,
  collectionId: string,
): Promise<MomentStudentOptionDto[]> {
  const collection = await prisma.momentCollection.findUnique({
    where: { id: collectionId },
    select: { createdBy: true },
  });
  if (!collection) throw notFound('Moment');
  assertCanManage(collection, ctx);

  const scope = await readableStudentIds(ctx);

  const [students, taken] = await Promise.all([
    prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        ...(scope === 'ALL' ? {} : { id: { in: scope } }),
      },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, gradeLabel: true, avatarPath: true },
    }),
    prisma.momentEntryStudent.findMany({
      where: { collectionId },
      select: { entryId: true, studentId: true },
    }),
  ]);

  const placed = new Map<string, string[]>();
  for (const row of taken) {
    placed.set(row.studentId, [...(placed.get(row.studentId) ?? []), row.entryId]);
  }

  return Promise.all(
    students.map(async (s) => ({
      id: s.id,
      fullName: s.fullName,
      gradeLabel: s.gradeLabel,
      avatarUrl: await signAvatar(s.avatarPath),
      entryIds: placed.get(s.id) ?? [],
    })),
  );
}

/** Signed upload URL for an entry photo. The bytes never pass through us (AD-04). */
export async function createUploadUrl(fileName: string, mimeType: string) {
  return storage.createUploadUrl(fileName, mimeType, 'moment-entries');
}

export async function createCollection(
  ctx: AuthContext,
  input: CreateMomentCollectionInput,
): Promise<MomentCollectionDetailDto> {
  // A teacher may only file a moment under a subject they were given, and only
  // an admin is ever offered Others — so one membership check covers both.
  const allowed = await listSubjectOptions(ctx);
  if (!allowed.some((s) => s.id === input.subjectId)) {
    throw forbidden('You can only create moments for a subject you teach.');
  }

  const created = await prisma.momentCollection.create({
    data: {
      heading: input.heading,
      description: input.description || null,
      startDate: atUtcMidnight(input.startDate),
      endDate: atUtcMidnight(input.endDate),
      // Others is the absence of a subject, not a subject named "Others" (022).
      subjectId: isOthersFolder(input.subjectId) ? null : input.subjectId,
      coverPath: input.coverPath || null,
      createdBy: ctx.userId,
    },
    select: { id: true },
  });

  await audit({
    actorId: ctx.userId,
    action: 'MOMENT_COLLECTION_CREATED',
    entity: 'MomentCollection',
    entityId: created.id,
    after: { heading: input.heading, subjectId: input.subjectId },
  });

  return getCollection(ctx, created.id);
}

export async function updateCollection(
  ctx: AuthContext,
  collectionId: string,
  data: {
    heading?: string;
    description?: string | null;
    startDate?: string;
    endDate?: string;
    subjectId?: string;
    coverPath?: string | null;
  },
): Promise<MomentCollectionDetailDto> {
  const existing = await prisma.momentCollection.findUnique({
    where: { id: collectionId },
    select: { createdBy: true, startDate: true, endDate: true },
  });
  if (!existing) throw notFound('Moment');
  assertCanManage(existing, ctx);

  // Either date may arrive alone, so the pair is re-checked against what is
  // already stored rather than against the request alone.
  const startDate = data.startDate ? atUtcMidnight(data.startDate) : existing.startDate;
  const endDate = data.endDate ? atUtcMidnight(data.endDate) : existing.endDate;
  if (endDate < startDate) throw conflict('The end date cannot be before the start date.');

  if (data.subjectId) {
    const allowed = await listSubjectOptions(ctx);
    if (!allowed.some((s) => s.id === data.subjectId)) {
      throw forbidden('You can only file a moment under a subject you teach.');
    }
  }

  await prisma.momentCollection.update({
    where: { id: collectionId },
    data: {
      ...(data.heading !== undefined ? { heading: data.heading } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.startDate ? { startDate } : {}),
      ...(data.endDate ? { endDate } : {}),
      ...(data.subjectId
        ? { subjectId: isOthersFolder(data.subjectId) ? null : data.subjectId }
        : {}),
      // Explicit null clears the cover; absent leaves it alone.
      ...(data.coverPath !== undefined ? { coverPath: data.coverPath } : {}),
    },
  });

  await audit({
    actorId: ctx.userId,
    action: 'MOMENT_COLLECTION_UPDATED',
    entity: 'MomentCollection',
    entityId: collectionId,
    after: data as Prisma.InputJsonValue,
  });

  return getCollection(ctx, collectionId);
}

export async function deleteCollection(ctx: AuthContext, collectionId: string): Promise<void> {
  const existing = await prisma.momentCollection.findUnique({
    where: { id: collectionId },
    select: { createdBy: true, heading: true, _count: { select: { entries: true } } },
  });
  if (!existing) throw notFound('Moment');
  assertCanManage(existing, ctx);

  // Entries and their links go with it — the cascade is declared in 021.
  await prisma.momentCollection.delete({ where: { id: collectionId } });

  await audit({
    actorId: ctx.userId,
    action: 'MOMENT_COLLECTION_DELETED',
    entity: 'MomentCollection',
    entityId: collectionId,
    before: { heading: existing.heading, entries: existing._count.entries },
  });
}

/**
 * Turn one filled-in form into an entry (024).
 *
 *   INDIVIDUAL  one child, one card.
 *   GROUP       one card naming everyone chosen.
 *
 * Both are a single row with its audience attached; the kind is what the card
 * reads as, and the schema is what holds each to its own arity — one child for
 * an individual entry, two or more for a group. So there is no fan-out here and
 * nothing to make atomic: one create, whichever was asked for.
 *
 * Either way a child is in a moment at most once, group and individual alike,
 * and the unique index on `moment_entry_students` is what makes that true.
 */
export async function addEntries(
  ctx: AuthContext,
  collectionId: string,
  input: CreateMomentEntryInput,
): Promise<MomentCollectionDetailDto> {
  const collection = await prisma.momentCollection.findUnique({
    where: { id: collectionId },
    select: { createdBy: true },
  });
  if (!collection) throw notFound('Moment');
  assertCanManage(collection, ctx);

  // "Select all" plus a stray click can send the same child twice; that is a
  // duplicate in the request, not a duplicate in the moment.
  const studentIds = [...new Set(input.studentIds)];

  const scope = await readableStudentIds(ctx);
  if (scope !== 'ALL') {
    const outside = studentIds.filter((id) => !scope.includes(id));
    if (outside.length > 0) {
      throw forbidden(
        outside.length === 1
          ? 'One of those students is not one of yours.'
          : `${outside.length} of those students are not yours.`,
      );
    }
  }

  // No check that these children are new to the moment: since 025 they need not
  // be. The speech and the group dance are both theirs.
  const links = input.referenceLinks.map((link, index) => ({
    label: link.label || null,
    url: link.url,
    displayOrder: index,
  }));

  await prisma.momentEntry.create({
    data: {
      collectionId,
      kind: input.kind,
      title: input.title,
      description: input.description || null,
      // One upload, one stored object, however many children the card names.
      photoPath: input.photoPath || null,
      videoUrl: input.videoUrl || null,
      createdBy: ctx.userId,
      links: { create: links },
      students: { create: studentIds.map((studentId) => ({ studentId, collectionId })) },
    },
  });

  await audit({
    actorId: ctx.userId,
    action: 'MOMENT_ENTRY_ADDED',
    entity: 'MomentCollection',
    entityId: collectionId,
    after: { kind: input.kind, studentIds, students: studentIds.length, title: input.title },
  });

  return getCollection(ctx, collectionId);
}

/**
 * Work out what changing a group's roster would mean, and refuse it if it cannot
 * be allowed. Returns null when the caller is not changing the roster at all.
 *
 * The checks mirror the ones adding a child goes through, with one deliberate
 * asymmetry: a child may only be *added* if the caller can see them, but anyone
 * may be *taken out* of an entry the caller manages. Requiring scope to remove
 * would strand a teacher who inherited a name they cannot read — and they can
 * already delete the whole entry, so it would guard nothing.
 */
async function plannedRoster(
  ctx: AuthContext,
  entry: { kind: MomentEntryKind; students: Array<{ studentId: string }> },
  studentIds: string[] | undefined,
): Promise<{ added: string[]; removed: string[] } | null> {
  if (!studentIds) return null;

  if (entry.kind !== 'GROUP') {
    throw conflict('Who an individual entry is for cannot be changed. Remove it and add it again.');
  }

  const wanted = [...new Set(studentIds)];
  if (wanted.length < 2) {
    throw conflict('A group entry needs at least two students. Remove it instead to take it out.');
  }

  const current = new Set(entry.students.map((s) => s.studentId));
  const added = wanted.filter((id) => !current.has(id));
  const removed = [...current].filter((id) => !wanted.includes(id));
  if (added.length === 0 && removed.length === 0) return null;

  const scope = await readableStudentIds(ctx);
  if (scope !== 'ALL') {
    const outside = added.filter((id) => !scope.includes(id));
    if (outside.length > 0) {
      throw forbidden(
        outside.length === 1
          ? 'One of those students is not one of yours.'
          : `${outside.length} of those students are not yours.`,
      );
    }
  }

  // A child already in another entry of this moment may still join this one —
  // the group dance does not disqualify them from the choir (025).
  return { added, removed };
}

/**
 * Edit an entry, including who is in it.
 *
 * A group's membership is the one part of an entry that was previously settled
 * for good, and it is exactly the part that gets it wrong: someone was away that
 * afternoon, someone else was left off. So `studentIds` replaces the whole roster
 * of a group entry — a full list rather than a delta, because that is what the
 * form has and it removes any question of which end a name was meant to go.
 *
 * An individual entry's child stays fixed. Moving a write-up from one child to
 * another is not an edit of that write-up, and doing it by accident would put
 * one family's photograph on another family's card.
 */
export async function updateEntry(
  ctx: AuthContext,
  collectionId: string,
  entryId: string,
  data: {
    studentIds?: string[];
    title?: string;
    description?: string | null;
    photoPath?: string | null;
    videoUrl?: string | null;
    referenceLinks?: Array<{ label?: string; url: string }>;
  },
): Promise<MomentCollectionDetailDto> {
  const entry = await prisma.momentEntry.findFirst({
    where: { id: entryId, collectionId },
    select: {
      id: true,
      kind: true,
      photoPath: true,
      videoUrl: true,
      students: { select: { studentId: true } },
      collection: { select: { createdBy: true } },
    },
  });
  if (!entry) throw notFound('Entry');
  assertCanManage(entry.collection, ctx);

  // An entry with neither a photo nor a video is just text. The create schema
  // refuses that; clearing one on edit must not sneak past it.
  const photoPath = data.photoPath !== undefined ? data.photoPath : entry.photoPath;
  const videoUrl = data.videoUrl !== undefined ? data.videoUrl : entry.videoUrl;
  if (!photoPath && !videoUrl) throw conflict('An entry needs a photo or a video link.');

  const roster = await plannedRoster(ctx, entry, data.studentIds);

  await prisma.$transaction(async (tx) => {
    if (roster) {
      await tx.momentEntryStudent.deleteMany({
        where: { entryId, studentId: { in: roster.removed } },
      });
      await tx.momentEntryStudent.createMany({
        data: roster.added.map((studentId) => ({ entryId, studentId, collectionId })),
      });
    }

    await tx.momentEntry.update({
      where: { id: entryId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.photoPath !== undefined ? { photoPath: data.photoPath || null } : {}),
        ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl || null } : {}),
      },
    });

    // Links are a small ordered set, so replacing them wholesale keeps the
    // stored order matching the order the user arranged them in.
    if (data.referenceLinks) {
      await tx.momentEntryLink.deleteMany({ where: { entryId } });
      if (data.referenceLinks.length) {
        await tx.momentEntryLink.createMany({
          data: data.referenceLinks.map((link, index) => ({
            entryId,
            label: link.label || null,
            url: link.url,
            displayOrder: index,
          })),
        });
      }
    }
  });

  await audit({
    actorId: ctx.userId,
    action: 'MOMENT_ENTRY_UPDATED',
    entity: 'MomentEntry',
    entityId: entryId,
    // Who joined and who left, rather than only the list that was sent — the
    // question asked of an audit log later is "who was taken out of this".
    after: { ...data, ...(roster ?? {}) } as Prisma.InputJsonValue,
  });

  return getCollection(ctx, collectionId);
}

export async function deleteEntry(
  ctx: AuthContext,
  collectionId: string,
  entryId: string,
): Promise<MomentCollectionDetailDto> {
  const entry = await prisma.momentEntry.findFirst({
    where: { id: entryId, collectionId },
    select: {
      id: true,
      kind: true,
      students: { select: { studentId: true } },
      collection: { select: { createdBy: true } },
    },
  });
  if (!entry) throw notFound('Entry');
  assertCanManage(entry.collection, ctx);

  // Removing a group entry frees everyone in it, which is why the audit records
  // the whole roster rather than a single child.
  await prisma.momentEntry.delete({ where: { id: entryId } });

  await audit({
    actorId: ctx.userId,
    action: 'MOMENT_ENTRY_REMOVED',
    entity: 'MomentCollection',
    entityId: collectionId,
    before: { entryId, kind: entry.kind, studentIds: entry.students.map((s) => s.studentId) },
  });

  return getCollection(ctx, collectionId);
}
