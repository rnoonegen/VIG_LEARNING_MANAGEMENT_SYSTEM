import type { Prisma } from '@prisma/client';
import type { AttendanceEntryDto, ClassContextDto, ClassRecordDraft } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { container } from '../../ai/container.js';
import { toOccurrenceDto } from '../scheduling/service.js';
import { skillsForLevel } from '../curriculum/service.js';
import { signMany } from '../../lib/storage.js';

/**
 * The class record is where the whole product converges (BR-01): attendance, the
 * class note, per-student observations, learning updates, development evidence
 * and moments all hang off one Class Occurrence. There is no second class history.
 */

const occurrenceInclude = {
  class: {
    include: {
      subject: true,
      level: true,
      students: { include: { student: { select: { id: true, fullName: true, avatarPath: true } } } },
    },
  },
  teacher: { include: { user: { select: { fullName: true } } } },
  classRecord: { select: { id: true, status: true } },
} satisfies Prisma.ClassOccurrenceInclude;

/** Before a class: who is in it, what happened last time, what can be recorded. */
export async function getContext(occurrenceId: string): Promise<ClassContextDto> {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    include: occurrenceInclude,
  });
  if (!occurrence) throw notFound('Class');

  const [previous, skills, areas, avatars] = await Promise.all([
    prisma.classRecord.findFirst({
      where: {
        status: 'SAVED',
        occurrence: { classId: occurrence.classId, scheduledStart: { lt: occurrence.scheduledStart } },
      },
      orderBy: { occurrence: { scheduledStart: 'desc' } },
      include: { occurrence: { select: { scheduledStart: true } } },
    }),
    skillsForLevel(occurrence.class.levelId),
    prisma.developmentArea.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
    }),
    signMany(
      occurrence.class.students.map((cs) => cs.student.avatarPath).filter((p): p is string => Boolean(p)),
    ),
  ]);

  return {
    occurrence: toOccurrenceDto(occurrence),
    students: occurrence.class.students.map((cs) => ({
      id: cs.student.id,
      fullName: cs.student.fullName,
      avatarUrl: cs.student.avatarPath ? (avatars.get(cs.student.avatarPath) ?? null) : null,
    })),
    previousRecord: previous
      ? {
          id: previous.id,
          occurrenceDate: previous.occurrence.scheduledStart.toISOString(),
          overallClassNote: previous.overallClassNote,
        }
      : null,
    skills,
    developmentAreas: areas.map((a) => ({ id: a.id, name: a.name, category: a.category })),
  };
}

/** Attendance comes first: nothing may be recorded about a child who was not there. */
export async function putAttendance(
  occurrenceId: string,
  entries: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE'; note?: string }>,
) {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { class: { include: { students: true } } },
  });
  if (!occurrence) throw notFound('Class');

  const roster = new Set(occurrence.class.students.map((cs) => cs.studentId));
  for (const e of entries) {
    if (!roster.has(e.studentId)) throw badRequest('That student is not in this class.');
  }

  await prisma.$transaction(
    entries.map((e) =>
      prisma.attendance.upsert({
        where: { occurrenceId_studentId: { occurrenceId, studentId: e.studentId } },
        create: { occurrenceId, studentId: e.studentId, status: e.status, note: e.note ?? null },
        update: { status: e.status, note: e.note ?? null },
      }),
    ),
  );

  return getAttendance(occurrenceId);
}

export async function getAttendance(occurrenceId: string): Promise<AttendanceEntryDto[]> {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      class: { include: { students: { include: { student: { select: { id: true, fullName: true } } } } } },
      attendance: true,
    },
  });
  if (!occurrence) throw notFound('Class');

  return occurrence.class.students.map((cs) => {
    const marked = occurrence.attendance.find((a) => a.studentId === cs.studentId);
    return {
      studentId: cs.studentId,
      fullName: cs.student.fullName,
      status: marked?.status ?? null,
      note: marked?.note ?? null,
    };
  });
}

/**
 * Opens (or reopens) the draft record for an occurrence.
 *
 * TODO(AI-PHASE-2): Phase 2 also returns a signed audio upload URL here and moves
 * the record through TRANSCRIBING → PROCESSING before IN_REVIEW.
 * See docs/DEFERRED-AI.md §2.3.
 */
export async function openDraft(occurrenceId: string, authorId: string) {
  const occurrence = await prisma.classOccurrence.findUnique({ where: { id: occurrenceId } });
  if (!occurrence) throw notFound('Class');

  const record = await prisma.classRecord.upsert({
    where: { occurrenceId },
    create: { occurrenceId, authorId, status: 'DRAFT' },
    update: {},
    include: { observations: true },
  });

  if (record.status === 'SAVED') {
    throw badRequest('This class record has already been saved.');
  }
  return getRecord(record.id);
}

export async function getRecord(recordId: string) {
  const record = await prisma.classRecord.findUnique({
    where: { id: recordId },
    include: {
      observations: { include: { student: { select: { fullName: true } } } },
      occurrence: { include: occurrenceInclude },
      author: { select: { fullName: true } },
    },
  });
  if (!record) throw notFound('Class record');

  return {
    id: record.id,
    occurrenceId: record.occurrenceId,
    status: record.status,
    overallClassNote: record.overallClassNote,
    authorName: record.author.fullName,
    savedAt: record.savedAt?.toISOString() ?? null,
    occurrence: toOccurrenceDto(record.occurrence),
    observations: record.observations.map((o) => ({
      studentId: o.studentId,
      studentName: o.student.fullName,
      observation: o.observation,
      isAiGenerated: o.isAiGenerated,
      wasEdited: o.wasEdited,
    })),
  };
}

/** Saves work-in-progress without committing anything to a student's history. */
export async function patchDraft(recordId: string, draft: Partial<ClassRecordDraft>) {
  const record = await prisma.classRecord.findUnique({ where: { id: recordId } });
  if (!record) throw notFound('Class record');
  if (record.status === 'SAVED') throw badRequest('This class record has already been saved.');

  await prisma.classRecord.update({
    where: { id: recordId },
    data: {
      ...(draft.overallClassNote !== undefined ? { overallClassNote: draft.overallClassNote } : {}),
      status: 'IN_REVIEW',
    },
  });
  return getRecord(recordId);
}

/**
 * The one genuinely transactional endpoint (BR-19).
 *
 * Attendance, the class note, observations, accepted learning updates, accepted
 * development observations and moment links land together or not at all. A
 * partial save would leave a child's record half-written, which is worse than
 * failing outright.
 *
 * Two rules are enforced here rather than trusted from the client:
 *   - The overall class note is always preserved, even when every optional
 *     update is skipped (BR-02).
 *   - Absent students receive no observations or updates (BR-15).
 */
export async function saveRecord(recordId: string, draft: ClassRecordDraft, authorId: string) {
  const record = await prisma.classRecord.findUnique({
    where: { id: recordId },
    include: {
      occurrence: {
        include: {
          attendance: true,
          class: { include: { students: true, subject: true, level: true } },
        },
      },
    },
  });
  if (!record) throw notFound('Class record');
  if (record.status === 'SAVED') throw badRequest('This class record has already been saved.');
  if (!draft.overallClassNote.trim()) throw badRequest('The overall class note is required.');

  const absent = new Set(
    record.occurrence.attendance.filter((a) => a.status === 'ABSENT').map((a) => a.studentId),
  );
  const roster = new Set(record.occurrence.class.students.map((cs) => cs.studentId));

  const eligible = (studentId: string) => roster.has(studentId) && !absent.has(studentId);

  const observations = draft.studentObservations.filter(
    (o) => eligible(o.studentId) && o.observation.trim().length > 0,
  );
  const learningUpdates = draft.proposedLearningUpdates.filter((u) => eligible(u.studentId));
  const developmentObservations = draft.proposedDevelopmentObservations.filter((o) =>
    eligible(o.studentId),
  );

  const observedOn = new Date(record.occurrence.scheduledStart);
  observedOn.setUTCHours(0, 0, 0, 0);

  await prisma.$transaction(async (tx) => {
    await tx.classRecord.update({
      where: { id: recordId },
      data: {
        overallClassNote: draft.overallClassNote.trim(),
        status: 'SAVED',
        savedAt: new Date(),
      },
    });

    // Observations are replaced wholesale — the draft is the teacher's final word.
    await tx.studentObservation.deleteMany({ where: { classRecordId: recordId } });
    if (observations.length) {
      await tx.studentObservation.createMany({
        data: observations.map((o) => ({
          classRecordId: recordId,
          studentId: o.studentId,
          observation: o.observation.trim(),
          isAiGenerated: o.isAiGenerated,
          wasEdited: false,
        })),
      });
    }

    // Learning: append history, then project current state in the same transaction.
    for (const update of learningUpdates) {
      const current = await tx.studentSkillProgress.findUnique({
        where: { studentId_skillId: { studentId: update.studentId, skillId: update.skillId } },
      });

      await tx.learningUpdate.create({
        data: {
          studentId: update.studentId,
          skillId: update.skillId,
          previousStatus: current?.status ?? null,
          newStatus: update.newStatus,
          note: update.note ?? null,
          source: 'CLASS_RECORD',
          classRecordId: recordId,
          authorId,
        },
      });

      await tx.studentSkillProgress.upsert({
        where: { studentId_skillId: { studentId: update.studentId, skillId: update.skillId } },
        create: {
          studentId: update.studentId,
          skillId: update.skillId,
          status: update.newStatus,
          updatedBy: authorId,
        },
        update: { status: update.newStatus, updatedBy: authorId },
      });
    }

    // Development: evidence is appended, never overwritten (BR-09/BR-10).
    for (const obs of developmentObservations) {
      await tx.developmentObservation.create({
        data: {
          studentId: obs.studentId,
          areaId: obs.areaId,
          observation: obs.observation.trim(),
          observedOn,
          observerId: authorId,
          classRecordId: recordId,
          source: 'CLASS_RECORD',
        },
      });

      // Make sure the area exists on the student so it shows in their profile.
      await tx.studentDevelopmentArea.upsert({
        where: { studentId_areaId: { studentId: obs.studentId, areaId: obs.areaId } },
        create: { studentId: obs.studentId, areaId: obs.areaId },
        update: {},
      });
    }

    // Moments captured during the flow gain their class context.
    if (draft.momentIds.length) {
      await tx.moment.updateMany({
        where: { id: { in: draft.momentIds } },
        data: {
          classOccurrenceId: record.occurrenceId,
          subjectId: record.occurrence.class.subjectId,
          source: 'CLASS_RECORD',
        },
      });
    }

    await tx.classOccurrence.update({
      where: { id: record.occurrenceId },
      data: { status: 'COMPLETED' },
    });
  });

  await audit({
    actorId: authorId,
    action: 'CLASS_RECORD_SAVED',
    entity: 'ClassRecord',
    entityId: recordId,
    after: {
      observations: observations.length,
      learningUpdates: learningUpdates.length,
      developmentObservations: developmentObservations.length,
      moments: draft.momentIds.length,
    },
  });

  return {
    record: await getRecord(recordId),
    // What the confirmation screen reports back to the teacher.
    updated: {
      learningUpdates: learningUpdates.length,
      developmentObservations: developmentObservations.length,
      moments: draft.momentIds.length,
      observations: observations.length,
      skippedAbsent:
        draft.studentObservations.length +
        draft.proposedLearningUpdates.length +
        draft.proposedDevelopmentObservations.length -
        (observations.length + learningUpdates.length + developmentObservations.length),
    },
  };
}

/**
 * The Phase-2 entry point, wired to the manual extractor today.
 *
 * Calling it with the teacher's typed draft returns that draft unchanged, which
 * is exactly what Phase 2 will do with a model-produced one — same shape, same
 * review UI, same save path (docs/DEFERRED-AI.md §2.2).
 */
export async function buildDraft(occurrenceId: string, manualDraft: ClassRecordDraft) {
  const context = await getContext(occurrenceId);
  const attendance = await getAttendance(occurrenceId);
  const present = attendance.filter((a) => a.status !== 'ABSENT');

  return container.classNoteExtractor.extract({
    transcript: '',
    roster: present.map((p) => ({ studentId: p.studentId, fullName: p.fullName })),
    subjectName: context.occurrence.subjectName,
    levelName: context.occurrence.levelName,
    skills: context.skills,
    developmentAreas: context.developmentAreas,
    manualDraft,
  });
}

/** The teacher's own queue for a given day. */
export async function teacherOccurrences(teacherId: string, dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const rows = await prisma.classOccurrence.findMany({
    where: { teacherId, scheduledStart: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
    include: occurrenceInclude,
    orderBy: { scheduledStart: 'asc' },
  });
  return rows.map(toOccurrenceDto);
}
