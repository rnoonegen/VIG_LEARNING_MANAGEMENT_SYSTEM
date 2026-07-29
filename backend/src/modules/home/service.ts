import type { Prisma } from '@prisma/client';
import type { AdminHomeDto, SetupStepDto, TeacherHomeDto } from '@vig/shared';
import { formatLongDate } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { env } from '../../env.js';
import { toOccurrenceDto } from '../scheduling/service.js';
import { computeAttention } from './attention.js';

/**
 * Home is an operational summary, not a duplicate of Schedule/Students/Curriculum
 * (Flow 01). It answers three questions and stops: what is happening today, is
 * anything blocking it, and what needs me?
 */

const occurrenceInclude = {
  class: {
    include: {
      subject: true,
      level: true,
      students: { include: { student: { select: { id: true, fullName: true } } } },
    },
  },
  teacher: { include: { user: { select: { fullName: true } } } },
  classRecord: { select: { id: true, status: true } },
} satisfies Prisma.ClassOccurrenceInclude;

function dayBounds(reference = new Date()) {
  const start = new Date(reference);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * The setup checklist enforces dependency order (F11): a scheduling screen with
 * no curriculum, teachers or students is not a screen worth reaching.
 */
export async function getSetupProgress(): Promise<SetupStepDto[]> {
  const [subjects, skills, teachers, capableTeachers, students, readyStudents, classes] = await Promise.all([
    prisma.subject.count({ where: { status: 'ACTIVE' } }),
    prisma.skill.count({ where: { status: 'ACTIVE' } }),
    prisma.teacher.count({ where: { user: { status: 'ACTIVE' } } }),
    prisma.teacher.count({ where: { user: { status: 'ACTIVE' }, capabilities: { some: {} } } }),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.student.count({
      where: { status: 'ACTIVE', subjectLevels: { some: { isCurrent: true } }, availability: { some: {} } },
    }),
    prisma.class.count({ where: { status: 'ACTIVE' } }),
  ]);

  return [
    {
      key: 'CURRICULUM',
      title: 'Set up Curriculum',
      description: 'Add the subjects and levels your students learn.',
      complete: subjects > 0 && skills > 0,
      actionLabel: subjects > 0 ? 'Open Curriculum' : 'Set up Curriculum',
      actionHref: '/admin/curriculum',
      count: subjects,
    },
    {
      key: 'TEACHERS',
      title: 'Add Teachers',
      description: 'Add your teachers and what they can teach.',
      complete: capableTeachers > 0,
      actionLabel: teachers > 0 ? 'Open Teachers' : 'Add Teachers',
      actionHref: '/admin/teachers',
      count: teachers,
    },
    {
      key: 'STUDENTS',
      title: 'Add Students',
      description: 'Add children, their subject levels and availability.',
      complete: readyStudents > 0,
      actionLabel: students > 0 ? 'Open Students' : 'Add Students',
      actionHref: '/admin/students',
      count: students,
    },
    {
      key: 'SCHEDULE',
      title: 'Create Schedule',
      description: 'Turn people and curriculum into classes.',
      complete: classes > 0,
      actionLabel: classes > 0 ? 'Open Schedule' : 'Schedule Classes',
      actionHref: '/admin/schedule',
      count: classes,
    },
  ];
}

export async function getAdminHome(greetingName: string): Promise<AdminHomeDto> {
  const { start, end } = dayBounds();

  const [todays, setupSteps, attention] = await Promise.all([
    prisma.classOccurrence.findMany({
      where: { scheduledStart: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      include: occurrenceInclude,
      orderBy: { scheduledStart: 'asc' },
    }),
    getSetupProgress(),
    computeAttention(),
  ]);

  return {
    greetingName,
    today: formatLongDate(new Date(), env.SCHOOL_TIMEZONE),
    setupComplete: setupSteps.every((s) => s.complete),
    setupSteps,
    todaysClasses: todays.map(toOccurrenceDto),
    attention,
  };
}

/**
 * Teacher Home is a work queue for the day (Flow 05): what is on, what still
 * needs a record, what is coming. No school-wide data.
 */
export async function getTeacherHome(teacherId: string, greetingName: string): Promise<TeacherHomeDto> {
  const now = new Date();
  const { start, end } = dayBounds(now);
  const weekAhead = new Date(now);
  weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);

  const [todays, due, upcoming] = await Promise.all([
    prisma.classOccurrence.findMany({
      where: { teacherId, scheduledStart: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      include: occurrenceInclude,
      orderBy: { scheduledStart: 'asc' },
    }),
    prisma.classOccurrence.findMany({
      where: {
        teacherId,
        scheduledEnd: { lt: now },
        status: { not: 'CANCELLED' },
        OR: [{ classRecord: null }, { classRecord: { status: { not: 'SAVED' } } }],
      },
      include: occurrenceInclude,
      orderBy: { scheduledStart: 'desc' },
      take: 10,
    }),
    prisma.classOccurrence.findMany({
      where: { teacherId, scheduledStart: { gte: end, lte: weekAhead }, status: { not: 'CANCELLED' } },
      include: occurrenceInclude,
      orderBy: { scheduledStart: 'asc' },
      take: 5,
    }),
  ]);

  return {
    greetingName,
    today: formatLongDate(now, env.SCHOOL_TIMEZONE),
    todaysClasses: todays.map(toOccurrenceDto),
    recordsDue: due.map(toOccurrenceDto),
    upcoming: upcoming.map(toOccurrenceDto),
  };
}
