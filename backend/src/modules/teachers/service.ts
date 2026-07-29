import type { Prisma } from '@prisma/client';
import type { TeacherDto, TeacherSummaryDto } from '@vig/shared';
import { formatTime12h } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createUser } from '../../auth/service.js';
import { resolveAvailability } from '../scheduling/availability.js';

/**
 * A teacher is not assumed able to teach everything (F5). Capabilities pin the
 * subject and the level range; availability pins when. Both become hard
 * constraints in the scheduling engine (BR-06).
 */

const teacherInclude = {
  user: true,
  capabilities: { include: { subject: true } },
  availability: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
  exceptions: { orderBy: { date: 'asc' } },
} satisfies Prisma.TeacherInclude;

/** Level display orders → readable names, for rendering a capability range. */
async function levelNameLookup(subjectIds: string[]) {
  const levels = await prisma.level.findMany({
    where: { subjectId: { in: subjectIds } },
    select: { subjectId: true, name: true, displayOrder: true },
  });
  const map = new Map<string, Map<number, string>>();
  for (const l of levels) {
    if (!map.has(l.subjectId)) map.set(l.subjectId, new Map());
    map.get(l.subjectId)!.set(l.displayOrder, l.name);
  }
  return map;
}

export async function listTeachers(): Promise<TeacherSummaryDto[]> {
  const teachers = await prisma.teacher.findMany({
    where: { user: { status: { not: 'ARCHIVED' } } },
    include: teacherInclude,
    orderBy: { user: { fullName: 'asc' } },
  });

  const lookup = await levelNameLookup(teachers.flatMap((t) => t.capabilities.map((c) => c.subjectId)));
  const today = new Date();

  return teachers.map((t) => {
    const windows = resolveAvailability(t.availability, t.exceptions, today);
    return {
      id: t.id,
      userId: t.userId,
      fullName: t.user.fullName,
      username: t.user.username,
      status: t.user.status,
      subjects: t.capabilities.map((c) => {
        const names = lookup.get(c.subjectId);
        const min = names?.get(c.minLevelOrder) ?? `Level ${c.minLevelOrder + 1}`;
        const max = names?.get(c.maxLevelOrder) ?? `Level ${c.maxLevelOrder + 1}`;
        return {
          name: c.subject.name,
          levelRange: min === max ? min : `${min} – ${max}`,
          colorToken: c.subject.colorToken,
        };
      }),
      availableToday: windows.length
        ? windows.map((w) => `${formatTime12h(w.startTime)} – ${formatTime12h(w.endTime)}`).join(', ')
        : null,
    };
  });
}

export async function getTeacher(teacherId: string): Promise<TeacherDto> {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, include: teacherInclude });
  if (!teacher) throw notFound('Teacher');

  const lookup = await levelNameLookup(teacher.capabilities.map((c) => c.subjectId));

  return {
    id: teacher.id,
    userId: teacher.userId,
    fullName: teacher.user.fullName,
    username: teacher.user.username,
    status: teacher.user.status,
    notes: teacher.notes,
    capabilities: teacher.capabilities.map((c) => ({
      id: c.id,
      subjectId: c.subjectId,
      subjectName: c.subject.name,
      minLevelOrder: c.minLevelOrder,
      maxLevelOrder: c.maxLevelOrder,
      minLevelName: lookup.get(c.subjectId)?.get(c.minLevelOrder) ?? null,
      maxLevelName: lookup.get(c.subjectId)?.get(c.maxLevelOrder) ?? null,
      isPrimary: c.isPrimary,
    })),
    availability: teacher.availability.map((a) => ({
      id: a.id,
      weekday: a.weekday,
      startTime: a.startTime,
      endTime: a.endTime,
    })),
    exceptions: teacher.exceptions.map((e) => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      isAvailable: e.isAvailable,
      allDay: e.allDay,
      startTime: e.startTime,
      endTime: e.endTime,
      reason: e.reason,
    })),
  };
}

/** Creates the login account and the teacher record together. */
export async function createTeacher(
  input: { username: string; fullName: string; notes?: string },
  actorId: string,
) {
  const { user, tempPassword } = await createUser({
    username: input.username,
    fullName: input.fullName,
    role: 'TEACHER',
    actorId,
  });

  const teacher = await prisma.teacher.update({
    where: { userId: user.id },
    data: { notes: input.notes ?? null },
  });

  return { teacherId: teacher.id, userId: user.id, username: user.username, tempPassword };
}

export async function updateTeacher(teacherId: string, data: { fullName?: string; notes?: string }) {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) throw notFound('Teacher');

  if (data.fullName) {
    await prisma.user.update({ where: { id: teacher.userId }, data: { fullName: data.fullName } });
  }
  if (data.notes !== undefined) {
    await prisma.teacher.update({ where: { id: teacherId }, data: { notes: data.notes } });
  }
  return getTeacher(teacherId);
}

/** Replaces the whole capability set — the editor sends the full list. */
export async function putCapabilities(
  teacherId: string,
  capabilities: Array<{
    subjectId: string;
    minLevelOrder: number;
    maxLevelOrder: number;
    isPrimary: boolean;
  }>,
  actorId: string,
) {
  for (const c of capabilities) {
    if (c.minLevelOrder > c.maxLevelOrder) {
      throw badRequest('The lowest level in a range must not be above the highest.');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacherCapability.deleteMany({ where: { teacherId } });
    if (capabilities.length) {
      await tx.teacherCapability.createMany({
        data: capabilities.map((c) => ({ ...c, teacherId })),
      });
    }
  });

  await audit({ actorId, action: 'TEACHER_CAPABILITIES_SET', entity: 'Teacher', entityId: teacherId });
  return getTeacher(teacherId);
}

export async function putAvailability(
  teacherId: string,
  slots: Array<{ weekday: number; startTime: string; endTime: string }>,
  actorId: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.teacherAvailability.deleteMany({ where: { teacherId } });
    if (slots.length) {
      await tx.teacherAvailability.createMany({ data: slots.map((s) => ({ ...s, teacherId })) });
    }
  });

  await audit({ actorId, action: 'TEACHER_AVAILABILITY_SET', entity: 'Teacher', entityId: teacherId });
  return getTeacher(teacherId);
}

/**
 * A dated exception. Adding one does not rewrite the normal week — that
 * separation is the whole point (F5). Classes already booked on that date become
 * a Needs Attention issue rather than being moved silently.
 */
export async function addException(
  teacherId: string,
  input: {
    date: string;
    isAvailable: boolean;
    allDay: boolean;
    startTime?: string;
    endTime?: string;
    reason?: string;
  },
  actorId: string,
) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: { select: { fullName: true } } },
  });
  if (!teacher) throw notFound('Teacher');

  const exception = await prisma.teacherAvailabilityException.create({
    data: {
      teacherId,
      date: new Date(`${input.date}T00:00:00.000Z`),
      isAvailable: input.isAvailable,
      allDay: input.allDay,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      reason: input.reason ?? null,
    },
  });

  await audit({
    actorId,
    action: 'TEACHER_EXCEPTION_ADDED',
    entity: 'Teacher',
    entityId: teacherId,
    after: { date: input.date, isAvailable: input.isAvailable },
  });

  return exception;
}

export async function removeException(exceptionId: string) {
  await prisma.teacherAvailabilityException.delete({ where: { id: exceptionId } });
  return { removed: true };
}
