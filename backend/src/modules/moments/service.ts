import type { Prisma } from '@prisma/client';
import type { CreateMomentInput, MomentDto } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { signMany, storage } from '../../lib/storage.js';

/**
 * A Moment is one media object linked to many students (BR-11) — never one copy
 * per child. Media added during a class record inherits the class, date and
 * subject automatically, so nothing is uploaded or typed twice.
 */

const momentInclude = {
  subject: true,
  creator: { select: { fullName: true } },
  media: { orderBy: { displayOrder: 'asc' } },
  students: { include: { student: { select: { id: true, fullName: true } } } },
  occurrence: { include: { class: { include: { subject: true } } } },
} satisfies Prisma.MomentInclude;

type MomentRow = Prisma.MomentGetPayload<{ include: typeof momentInclude }>;

async function toDto(rows: MomentRow[]): Promise<MomentDto[]> {
  const signed = await signMany(rows.flatMap((r) => r.media.map((m) => m.storagePath)));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    caption: r.caption,
    capturedOn: r.capturedOn.toISOString().slice(0, 10),
    subjectName: r.subject?.name ?? null,
    colorToken: r.subject?.colorToken ?? null,
    classContext: r.occurrence
      ? `${r.occurrence.class.subject.name} · ${r.occurrence.scheduledStart.toISOString().slice(0, 10)}`
      : null,
    createdByName: r.creator.fullName,
    students: r.students.map((s) => s.student),
    media: r.media.map((m) => ({
      id: m.id,
      url: signed.get(m.storagePath) ?? '',
      mimeType: m.mimeType,
      isVideo: m.mimeType.startsWith('video/'),
    })),
  }));
}

/** Signed upload URL. The bytes go straight to storage, never through us (AD-04). */
export async function createUploadUrl(fileName: string, mimeType: string) {
  return storage.createUploadUrl(fileName, mimeType);
}

export async function createMoment(input: CreateMomentInput, createdBy: string) {
  // When the moment comes from a class record, take its context rather than
  // asking the teacher to retype what we already know.
  let subjectId = input.subjectId ?? null;
  let capturedOn = input.capturedOn ? new Date(`${input.capturedOn}T00:00:00.000Z`) : new Date();

  if (input.classOccurrenceId) {
    const occurrence = await prisma.classOccurrence.findUnique({
      where: { id: input.classOccurrenceId },
      include: { class: { select: { subjectId: true } } },
    });
    if (occurrence) {
      subjectId ??= occurrence.class.subjectId;
      capturedOn = new Date(occurrence.scheduledStart);
      capturedOn.setUTCHours(0, 0, 0, 0);
    }
  }

  const moment = await prisma.$transaction(async (tx) => {
    const created = await tx.moment.create({
      data: {
        title: input.title,
        caption: input.caption ?? null,
        subjectId,
        classOccurrenceId: input.classOccurrenceId ?? null,
        capturedOn,
        createdBy,
        source: input.classOccurrenceId ? 'CLASS_RECORD' : 'MANUAL',
        media: {
          create: input.media.map((m, index) => ({
            storagePath: m.storagePath,
            mimeType: m.mimeType,
            sizeBytes: m.sizeBytes ?? null,
            displayOrder: index,
          })),
        },
        students: { create: input.studentIds.map((studentId) => ({ studentId })) },
      },
    });
    return created;
  });

  await audit({
    actorId: createdBy,
    action: 'MOMENT_CREATED',
    entity: 'Moment',
    entityId: moment.id,
    after: { students: input.studentIds.length, media: input.media.length },
  });

  return getMoment(moment.id);
}

export async function getMoment(momentId: string): Promise<MomentDto> {
  const row = await prisma.moment.findUnique({ where: { id: momentId }, include: momentInclude });
  if (!row) throw notFound('Moment');
  return (await toDto([row]))[0]!;
}

export async function listMoments(filters: {
  scope: string[] | 'ALL';
  studentId?: string;
  subjectId?: string;
  mediaType?: 'all' | 'photo' | 'video';
  limit?: number;
}): Promise<MomentDto[]> {
  const studentFilter =
    filters.scope === 'ALL'
      ? filters.studentId
        ? { students: { some: { studentId: filters.studentId } } }
        : {}
      : {
          students: {
            some: {
              studentId: filters.studentId
                ? filters.studentId
                : { in: filters.scope as string[] },
            },
          },
        };

  const rows = await prisma.moment.findMany({
    where: {
      ...studentFilter,
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    },
    include: momentInclude,
    orderBy: { capturedOn: 'desc' },
    take: filters.limit ?? 60,
  });

  const dtos = await toDto(rows);
  if (!filters.mediaType || filters.mediaType === 'all') return dtos;

  const wantVideo = filters.mediaType === 'video';
  return dtos.filter((m) => m.media.some((media) => media.isVideo === wantVideo));
}

export async function updateMoment(
  momentId: string,
  data: { title?: string; caption?: string; studentIds?: string[] },
) {
  await prisma.$transaction(async (tx) => {
    await tx.moment.update({
      where: { id: momentId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.caption !== undefined ? { caption: data.caption } : {}),
      },
    });

    if (data.studentIds) {
      await tx.momentStudent.deleteMany({ where: { momentId } });
      await tx.momentStudent.createMany({
        data: data.studentIds.map((studentId) => ({ momentId, studentId })),
      });
    }
  });

  return getMoment(momentId);
}
