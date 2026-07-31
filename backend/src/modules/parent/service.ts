import type { ParentChildDto, ParentHomeDto, SkillStatus } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { signAvatar } from '../../lib/storage.js';
import { listMoments } from '../moments/service.js';
import { getStudentDevelopment } from '../development/service.js';

/**
 * The Parent Portal is not a simplified Admin Portal — it has a different job.
 * Parents get approved outcomes only: no drafts, no operational machinery, no
 * schedule (BR-13, Flow 11).
 */

export async function listChildren(parentId: string): Promise<ParentChildDto[]> {
  const links = await prisma.parentStudent.findMany({
    where: { parentId, student: { status: { not: 'ARCHIVED' } } },
    include: { student: true },
    orderBy: { student: { fullName: 'asc' } },
  });

  return Promise.all(
    links.map(async (l) => ({
      id: l.student.id,
      fullName: l.student.fullName,
      gradeLabel: l.student.gradeLabel,
      relationship: l.relationship,
      avatarUrl: await signAvatar(l.student.avatarPath),
    })),
  );
}

/** Resolves which child to show, defaulting to the first linked child. */
export async function resolveChild(parentId: string, requestedId?: string): Promise<ParentChildDto> {
  const children = await listChildren(parentId);
  if (children.length === 0) throw notFound('Linked child');

  if (requestedId) {
    const match = children.find((c) => c.id === requestedId);
    if (!match) throw forbidden('You do not have access to this student.');
    return match;
  }
  return children[0]!;
}

/**
 * Home summarises; the tabs hold the detail. Everything here links deeper rather
 * than trying to be the whole record.
 */
export async function getHome(parentId: string, requestedChildId?: string): Promise<ParentHomeDto> {
  const child = await resolveChild(parentId, requestedChildId);

  const [latestUpdate, progress, development, moments] = await Promise.all([
    prisma.weeklyUpdate.findFirst({
      where: { studentId: child.id, status: 'PUBLISHED' },
      orderBy: { weekStart: 'desc' },
    }),
    prisma.studentSkillProgress.findMany({
      where: { studentId: child.id, status: { in: ['LEARNING', 'NEEDS_SUPPORT'] } },
      orderBy: { updatedAt: 'desc' },
      take: 4,
      include: {
        skill: { include: { topic: { include: { level: { include: { subject: true } } } } } },
      },
    }),
    getStudentDevelopment(child.id),
    listMoments({ scope: [child.id], studentId: child.id, limit: 1 }),
  ]);

  return {
    child,
    latestWeeklyUpdate: latestUpdate
      ? {
          id: latestUpdate.id,
          weekStart: latestUpdate.weekStart.toISOString().slice(0, 10),
          weekEnd: latestUpdate.weekEnd.toISOString().slice(0, 10),
          status: latestUpdate.status,
        }
      : null,
    learningNow: progress.map((p) => ({
      subjectName: p.skill.topic.level.subject.name,
      colorToken: p.skill.topic.level.subject.colorToken,
      skillName: p.skill.name,
      status: p.status as SkillStatus,
    })),
    developmentSnapshot: development
      .filter((d) => d.observationCount > 0)
      .slice(0, 5)
      .map((d) => ({ areaName: d.name, stage: d.currentStage })),
    recentMoment: moments[0] ?? null,
  };
}
