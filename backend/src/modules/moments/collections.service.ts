import type { Prisma } from '@prisma/client';
import type {
  CreateMomentCollectionInput,
  CreateMomentEntryInput,
  MomentCollectionDetailDto,
  MomentCollectionDto,
  MomentEntryDto,
  MomentStudentOptionDto,
  MomentSubjectOptionDto,
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
 * the subject it sits under — and then filled in one child at a time. Each entry
 * carries a photo, a video link, its own title and description, and any
 * reference links worth keeping.
 *
 * Who sees what:
 *   Admin    every moment, whoever opened it.
 *   Teacher  the ones they opened themselves, filed under a subject they hold
 *            the capability for.
 *   Parent   any moment their child appears in — and inside it, only their own
 *            child's entry. A parent never learns which other children were
 *            there, which is why the entry filter below is not cosmetic.
 */

const collectionInclude = {
  subject: { select: { id: true, name: true, colorToken: true } },
  creator: { select: { id: true, fullName: true } },
  entries: {
    orderBy: { createdAt: 'asc' },
    include: {
      student: { select: { id: true, fullName: true, avatarPath: true } },
      creator: { select: { fullName: true } },
      links: { orderBy: { displayOrder: 'asc' } },
    },
  },
} satisfies Prisma.MomentCollectionInclude;

type CollectionRow = Prisma.MomentCollectionGetPayload<{ include: typeof collectionInclude }>;

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const atUtcMidnight = (key: string) => new Date(`${key}T00:00:00.000Z`);

/**
 * A parent's copy of a moment shows only their own children's entries; everyone
 * else sees the whole thing. Applied before any mapping so a name belonging to
 * another family never reaches a DTO in the first place.
 */
function visibleEntries(row: CollectionRow, scope: string[] | 'ALL'): CollectionRow['entries'] {
  if (scope === 'ALL') return row.entries;
  return row.entries.filter((e) => scope.includes(e.studentId));
}

/** A moment is the creator's to change, and the admin's. Nobody else's. */
function canManage(row: { createdBy: string }, ctx: AuthContext): boolean {
  return ctx.role === 'ADMIN' || row.createdBy === ctx.userId;
}

function assertCanManage(row: { createdBy: string }, ctx: AuthContext): void {
  if (!canManage(row, ctx)) throw forbidden('This moment was created by someone else.');
}

async function toEntryDto(
  entries: CollectionRow['entries'],
  photoUrls: Map<string, string>,
): Promise<MomentEntryDto[]> {
  return Promise.all(
    entries.map(async (e) => ({
      id: e.id,
      student: {
        id: e.student.id,
        fullName: e.student.fullName,
        avatarUrl: await signAvatar(e.student.avatarPath),
      },
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
  entries: CollectionRow['entries'],
  photoUrls: Map<string, string>,
  ctx: AuthContext,
): MomentCollectionDto {
  return {
    id: row.id,
    heading: row.heading,
    description: row.description,
    startDate: dateKey(row.startDate),
    endDate: dateKey(row.endDate),
    subject: row.subject,
    createdBy: { id: row.creator.id, name: row.creator.fullName },
    canManage: canManage(row, ctx),
    entryCount: entries.length,
    previewPhotoUrls: entries
      .map((e) => (e.photoPath ? photoUrls.get(e.photoPath) : null))
      .filter((url): url is string => Boolean(url))
      .slice(0, 4),
    studentNames: entries.map((e) => e.student.fullName),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The moments this caller may see.
 *
 * The scope is pushed into the query rather than filtered afterwards, so a
 * teacher's list is never assembled from rows they had no business reading (§2).
 */
export async function listCollections(
  ctx: AuthContext,
  filters: { studentId?: string; subjectId?: string } = {},
): Promise<MomentCollectionDto[]> {
  const scope = await readableStudentIds(ctx);

  const where: Prisma.MomentCollectionWhereInput = {
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
  };

  if (ctx.role === 'TEACHER') {
    // A teacher's moments are the ones they opened. Someone else's moment about
    // the same child is not theirs to browse.
    where.createdBy = ctx.userId;
  } else if (ctx.role === 'PARENT') {
    // A parent reaches a moment only through a child of theirs being in it.
    const childIds = scope === 'ALL' ? [] : scope;
    where.entries = {
      some: { studentId: filters.studentId ? filters.studentId : { in: childIds } },
    };
  } else if (filters.studentId) {
    where.entries = { some: { studentId: filters.studentId } };
  }

  const rows = await prisma.momentCollection.findMany({
    where,
    include: collectionInclude,
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    take: 120,
  });

  // One signing pass for the whole page rather than one per card.
  const visible = rows.map((row) => ({ row, entries: visibleEntries(row, scope) }));
  const photoUrls = await signMany(
    visible.flatMap(({ entries }) =>
      entries.slice(0, 4).flatMap((e) => (e.photoPath ? [e.photoPath] : [])),
    ),
  );

  return visible.map(({ row, entries }) => toSummary(row, entries, photoUrls, ctx));
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

  // A teacher may open their own moments; a parent, one their child is in. An
  // empty visible list for a parent means the child is not in it at all.
  if (ctx.role === 'TEACHER' && row.createdBy !== ctx.userId) {
    throw forbidden('This moment was created by someone else.');
  }
  if (ctx.role === 'PARENT' && entries.length === 0) {
    throw forbidden('This moment does not include your child.');
  }

  const photoUrls = await signMany(entries.flatMap((e) => (e.photoPath ? [e.photoPath] : [])));

  return {
    ...toSummary(row, entries, photoUrls, ctx),
    entries: await toEntryDto(entries, photoUrls),
  };
}

/**
 * The subjects a moment may be filed under.
 *
 * An admin picks from the whole curriculum. A teacher picks from what they were
 * given to teach (BR-05) — the same capability that decides what they may
 * author anywhere else.
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
      .map(({ id, name, colorToken }) => ({ id, name, colorToken }));
  }

  const subjects = await prisma.subject.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, colorToken: true },
  });
  return subjects;
}

/**
 * The children who can still be added to this moment.
 *
 * Everyone the caller may see is returned, with the already-placed ones marked
 * rather than dropped — a name that vanishes reads as a missing child, while a
 * name shown as "already added" answers the question the user is actually
 * asking.
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
    prisma.momentEntry.findMany({
      where: { collectionId },
      select: { id: true, studentId: true },
    }),
  ]);

  const takenBy = new Map(taken.map((t) => [t.studentId, t.id]));

  return Promise.all(
    students.map(async (s) => ({
      id: s.id,
      fullName: s.fullName,
      gradeLabel: s.gradeLabel,
      avatarUrl: await signAvatar(s.avatarPath),
      takenByEntryId: takenBy.get(s.id) ?? null,
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
  // A teacher may only file a moment under a subject they were given.
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
      subjectId: input.subjectId,
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
      ...(data.subjectId ? { subjectId: data.subjectId } : {}),
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

export async function addEntry(
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

  const scope = await readableStudentIds(ctx);
  if (scope !== 'ALL' && !scope.includes(input.studentId)) {
    throw forbidden('This student is not one of yours.');
  }

  // The unique index is the real guard against a duplicate — two people saving
  // the same child at once both pass this check — but reaching it first turns a
  // race into a plain 409 with a sentence a user can act on.
  const taken = await prisma.momentEntry.findUnique({
    where: { collectionId_studentId: { collectionId, studentId: input.studentId } },
    select: { id: true },
  });
  if (taken) throw conflict('That student already has an entry in this moment.');

  try {
    await prisma.momentEntry.create({
      data: {
        collectionId,
        studentId: input.studentId,
        title: input.title,
        description: input.description || null,
        photoPath: input.photoPath || null,
        videoUrl: input.videoUrl || null,
        createdBy: ctx.userId,
        links: {
          create: input.referenceLinks.map((link, index) => ({
            label: link.label || null,
            url: link.url,
            displayOrder: index,
          })),
        },
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw conflict('That student already has an entry in this moment.');
    }
    throw err;
  }

  await audit({
    actorId: ctx.userId,
    action: 'MOMENT_ENTRY_ADDED',
    entity: 'MomentCollection',
    entityId: collectionId,
    after: { studentId: input.studentId, title: input.title },
  });

  return getCollection(ctx, collectionId);
}

export async function updateEntry(
  ctx: AuthContext,
  collectionId: string,
  entryId: string,
  data: {
    title?: string;
    description?: string | null;
    photoPath?: string | null;
    videoUrl?: string | null;
    referenceLinks?: Array<{ label?: string; url: string }>;
  },
): Promise<MomentCollectionDetailDto> {
  const entry = await prisma.momentEntry.findFirst({
    where: { id: entryId, collectionId },
    select: { id: true, photoPath: true, videoUrl: true, collection: { select: { createdBy: true } } },
  });
  if (!entry) throw notFound('Entry');
  assertCanManage(entry.collection, ctx);

  // An entry with neither a photo nor a video is just text. The create schema
  // refuses that; clearing one on edit must not sneak past it.
  const photoPath = data.photoPath !== undefined ? data.photoPath : entry.photoPath;
  const videoUrl = data.videoUrl !== undefined ? data.videoUrl : entry.videoUrl;
  if (!photoPath && !videoUrl) throw conflict('An entry needs a photo or a video link.');

  await prisma.$transaction(async (tx) => {
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
    after: data as Prisma.InputJsonValue,
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
    select: { id: true, studentId: true, collection: { select: { createdBy: true } } },
  });
  if (!entry) throw notFound('Entry');
  assertCanManage(entry.collection, ctx);

  await prisma.momentEntry.delete({ where: { id: entryId } });

  await audit({
    actorId: ctx.userId,
    action: 'MOMENT_ENTRY_REMOVED',
    entity: 'MomentCollection',
    entityId: collectionId,
    before: { entryId, studentId: entry.studentId },
  });

  return getCollection(ctx, collectionId);
}
