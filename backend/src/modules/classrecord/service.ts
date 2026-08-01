import type { Prisma } from '@prisma/client';
import type { AttendanceEntryDto, ClassContextDto, ClassRecordDraft } from '@vig/shared';
import { formatShortDate } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { describeDeadline, recordState, recordWindow, MAX_WINDOW_MS, MIN_WINDOW_MS } from './window.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { container } from '../../ai/container.js';
import { toOccurrenceDto } from '../scheduling/service.js';
import { headingsForLevel } from '../curriculum/service.js';
import { coveredByStudent } from '../learning/coverage.js';
import { avatarStorage, signMany } from '../../lib/storage.js';
import { notifyAllAdmins } from '../notifications/service.js';

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

/**
 * The write gate for everything that hangs off a class record.
 *
 * A class is recorded once, between its start and the following morning
 * (window.ts). Enforced for teachers, whose deadline this is; an admin is left a
 * way in, because a missed record is surfaced to them to resolve and locking
 * everyone out would make it permanently unresolvable.
 */
export async function assertRecordable(occurrenceId: string, enforce: boolean) {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    select: {
      id: true,
      scheduledStart: true,
      status: true,
      classRecord: { select: { status: true } },
    },
  });
  if (!occurrence) throw notFound('Class');

  if (occurrence.status === 'CANCELLED') {
    throw badRequest('This class was cancelled, so there is nothing to record.');
  }

  const state = recordState(occurrence.scheduledStart, occurrence.classRecord?.status, new Date());

  // One record per class, for everybody — an admin cannot overwrite one either.
  if (state === 'SAVED') {
    throw badRequest('This class has already been recorded. A class is recorded once.');
  }
  if (!enforce) return occurrence;

  if (state === 'NOT_YET_OPEN') {
    throw badRequest('This class has not started yet. You can record it once it begins.');
  }
  if (state === 'CLOSED') {
    const { closesAt } = recordWindow(occurrence.scheduledStart);
    throw badRequest(
      `Recording for this class closed at ${describeDeadline(closesAt)} on ${formatShortDate(closesAt)}. ` +
        'Ask an administrator if it still needs to be recorded.',
    );
  }

  return occurrence;
}

/** Before a class: who is in it, what happened last time, what can be recorded. */
export async function getContext(occurrenceId: string): Promise<ClassContextDto> {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    include: occurrenceInclude,
  });
  if (!occurrence) throw notFound('Class');

  const [previous, headings, areas, avatars] = await Promise.all([
    prisma.classRecord.findFirst({
      where: {
        status: 'SAVED',
        occurrence: { classId: occurrence.classId, scheduledStart: { lt: occurrence.scheduledStart } },
      },
      orderBy: { occurrence: { scheduledStart: 'desc' } },
      include: { occurrence: { select: { scheduledStart: true } } },
    }),
    headingsForLevel(occurrence.class.levelId),
    prisma.developmentArea.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
    }),
    signMany(
      occurrence.class.students.map((cs) => cs.student.avatarPath).filter((p): p is string => Boolean(p)),
      avatarStorage,
    ),
  ]);

  // The coverage grid opens showing what each child has already been taken
  // through, so a teacher ticks what is new rather than restating the term.
  const covered = await coveredByStudent(
    occurrence.class.students.map((cs) => cs.studentId),
    headings.flatMap((h) => h.subHeadings.map((s) => s.id)),
  );

  const window = recordWindow(occurrence.scheduledStart);
  const saved = await prisma.classRecord.findUnique({
    where: { occurrenceId },
    select: { savedAt: true },
  });

  return {
    occurrence: toOccurrenceDto(occurrence),
    record: {
      state: recordState(occurrence.scheduledStart, occurrence.classRecord?.status, new Date()),
      opensAt: window.opensAt.toISOString(),
      closesAt: window.closesAt.toISOString(),
      closesAtLabel: `${describeDeadline(window.closesAt)} on ${formatShortDate(window.closesAt)}`,
      savedAt: saved?.savedAt?.toISOString() ?? null,
    },
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
    headings,
    covered,
    developmentAreas: areas.map((a) => ({ id: a.id, name: a.name, category: a.category })),
  };
}

/** Attendance comes first: nothing may be recorded about a child who was not there. */
export async function putAttendance(
  occurrenceId: string,
  entries: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE'; note?: string }>,
  enforceWindow = true,
) {
  // Attendance is part of the record, so it lives or dies by the same deadline.
  await assertRecordable(occurrenceId, enforceWindow);

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
export async function openDraft(occurrenceId: string, authorId: string, enforceWindow = true) {
  await assertRecordable(occurrenceId, enforceWindow);

  const record = await prisma.classRecord.upsert({
    where: { occurrenceId },
    create: { occurrenceId, authorId, status: 'DRAFT' },
    update: {},
  });

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
export async function patchDraft(
  recordId: string,
  draft: Partial<ClassRecordDraft>,
  enforceWindow = true,
) {
  const record = await prisma.classRecord.findUnique({ where: { id: recordId } });
  if (!record) throw notFound('Class record');
  await assertRecordable(record.occurrenceId, enforceWindow);

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
export async function saveRecord(
  recordId: string,
  draft: ClassRecordDraft,
  authorId: string,
  enforceWindow = true,
) {
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

  // Refuses a second save and a save past the deadline, in one place.
  await assertRecordable(record.occurrenceId, enforceWindow);

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
    // The extractor contract takes one flat list; the grid groups it (§2.2).
    skills: context.headings.flatMap((h) =>
      h.subHeadings.map((s) => ({ id: s.id, name: s.name, topicName: h.name })),
    ),
    developmentAreas: context.developmentAreas,
    manualDraft,
  });
}

// ---------------------------------------------------------------------------
// Missed records
// ---------------------------------------------------------------------------

/**
 * Occurrences whose recording deadline passed with nothing written.
 *
 * The cutoff snaps to a wall-clock hour, so a window is between 9 and 33 hours
 * long and no single date comparison expresses "closed". The query narrows to
 * the band where the answer is uncertain and the exact rule settles those rows,
 * which keeps this a bounded read however long the school has been running.
 */
export async function findMissedRecords(where: Prisma.ClassOccurrenceWhereInput, now = new Date()) {
  const unwritten: Prisma.ClassOccurrenceWhereInput = {
    ...where,
    status: { not: 'CANCELLED' },
    OR: [{ classRecord: null }, { classRecord: { status: { not: 'SAVED' } } }],
  };

  const [certain, ambiguous] = await Promise.all([
    // Started longer ago than the longest possible window: certainly closed.
    prisma.classOccurrence.findMany({
      where: { ...unwritten, scheduledStart: { lt: new Date(+now - MAX_WINDOW_MS) } },
      include: occurrenceInclude,
      orderBy: { scheduledStart: 'desc' },
    }),
    // Inside the band where it depends on the class's own start time.
    prisma.classOccurrence.findMany({
      where: {
        ...unwritten,
        scheduledStart: { gte: new Date(+now - MAX_WINDOW_MS), lt: new Date(+now - MIN_WINDOW_MS) },
      },
      include: occurrenceInclude,
      orderBy: { scheduledStart: 'desc' },
    }),
  ]);

  const missed = [
    ...certain,
    ...ambiguous.filter((o) => recordState(o.scheduledStart, o.classRecord?.status, now) === 'CLOSED'),
  ];

  return missed.sort((a, b) => +b.scheduledStart - +a.scheduledStart);
}

/**
 * Tells every admin which teacher let a recording deadline pass.
 *
 * Grouped per teacher per day rather than per class: notification volume is a
 * locked product rule (BR-14), and three missed classes on one day is one thing
 * that went wrong, not three. The existing notification is the idempotency key,
 * so running this hourly does not re-announce yesterday.
 */
export async function sweepMissedRecords(now = new Date()): Promise<number> {
  // A first run on an old database should not spam months of history.
  const lookback = new Date(+now - 7 * 24 * 60 * 60 * 1000);
  const missed = await findMissedRecords({ scheduledStart: { gte: lookback } }, now);
  if (missed.length === 0) return 0;

  const groups = new Map<string, { teacherName: string; occurrences: typeof missed }>();
  for (const o of missed) {
    const dateKey = o.scheduledStart.toISOString().slice(0, 10);
    const key = `${o.teacherId}:${dateKey}`;
    const group = groups.get(key);
    if (group) group.occurrences.push(o);
    else groups.set(key, { teacherName: o.teacher.user.fullName, occurrences: [o] });
  }

  let announced = 0;

  for (const [groupKey, group] of groups) {
    const already = await prisma.notification.findFirst({
      where: {
        type: 'CLASS_RECORD_DUE',
        payload: { path: ['groupKey'], equals: groupKey },
      },
      select: { id: true },
    });
    if (already) continue;

    const count = group.occurrences.length;
    const date = group.occurrences[0]!.scheduledStart;

    await notifyAllAdmins({
      // Reuses the class-record notification type rather than adding a database
      // enum value for a message that is read, not queried.
      type: 'CLASS_RECORD_DUE',
      title: `${group.teacherName} missed ${count} class ${count === 1 ? 'record' : 'records'}`,
      body: `${group.occurrences
        .map((o) => o.class.subject.name)
        .join(', ')} on ${formatShortDate(date)} — the deadline to record has passed.`,
      payload: {
        groupKey,
        teacherId: group.occurrences[0]!.teacherId,
        occurrenceIds: group.occurrences.map((o) => o.id),
        // Singular too: the notification list builds its deep link from this,
        // so without it the card is unclickable.
        occurrenceId: group.occurrences[0]!.id,
      },
    });
    announced += 1;
  }

  return announced;
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
  return rows.map((o) => toOccurrenceDto(o));
}
