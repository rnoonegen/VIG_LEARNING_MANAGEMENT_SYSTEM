import type { DevCategory, DevelopmentAreaDto, DevelopmentObservationDto, DevStage } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

/**
 * Development is a longitudinal record of observed growth, not a score (BR-10).
 * The stage is a human judgement that never changes automatically; the evidence
 * underneath it is what actually matters, and it is append-only.
 */

export async function listAreas() {
  return prisma.developmentArea.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
  });
}

export async function createArea(input: { category: DevCategory; name: string; description?: string }) {
  const last = await prisma.developmentArea.findFirst({
    where: { category: input.category },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  });

  return prisma.developmentArea.create({
    data: {
      category: input.category,
      name: input.name,
      description: input.description ?? null,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    },
  });
}

/**
 * Every active area is returned, whether or not this student has evidence yet —
 * an area with no observations is meaningful information, not an omission.
 */
export async function getStudentDevelopment(studentId: string): Promise<DevelopmentAreaDto[]> {
  const [areas, studentAreas, observations] = await Promise.all([
    listAreas(),
    prisma.studentDevelopmentArea.findMany({ where: { studentId } }),
    prisma.developmentObservation.findMany({
      where: { studentId },
      orderBy: { observedOn: 'desc' },
      include: { observer: { select: { fullName: true } } },
    }),
  ]);

  const stageByArea = new Map(studentAreas.map((sa) => [sa.areaId, sa.currentStage]));

  return areas.map((area) => {
    const forArea = observations.filter((o) => o.areaId === area.id);
    const latest = forArea[0];

    return {
      areaId: area.id,
      name: area.name,
      category: area.category,
      description: area.description,
      currentStage: (stageByArea.get(area.id) ?? 'EMERGING') as DevStage,
      observationCount: forArea.length,
      latestObservation: latest
        ? {
            id: latest.id,
            observation: latest.observation,
            observedOn: latest.observedOn.toISOString().slice(0, 10),
            observerName: latest.observer.fullName,
          }
        : null,
    };
  });
}

/** The evidence timeline for one area — how the picture built up over months. */
export async function getAreaEvidence(
  studentId: string,
  areaId: string,
): Promise<{ area: DevelopmentAreaDto; observations: DevelopmentObservationDto[] }> {
  const areas = await getStudentDevelopment(studentId);
  const area = areas.find((a) => a.areaId === areaId);
  if (!area) throw notFound('Development area');

  const rows = await prisma.developmentObservation.findMany({
    where: { studentId, areaId },
    orderBy: { observedOn: 'desc' },
    include: {
      observer: { select: { fullName: true } },
      classRecord: {
        include: { occurrence: { include: { class: { include: { subject: true } } } } },
      },
    },
  });

  return {
    area,
    observations: rows.map((r) => ({
      id: r.id,
      observation: r.observation,
      observedOn: r.observedOn.toISOString().slice(0, 10),
      observerName: r.observer.fullName,
      source: r.source,
      classContext: r.classRecord
        ? `${r.classRecord.occurrence.class.subject.name} · ${r.classRecord.occurrence.scheduledStart
            .toISOString()
            .slice(0, 10)}`
        : null,
    })),
  };
}

export async function addObservation(
  studentId: string,
  areaId: string,
  input: { observation: string; observedOn?: string },
  observerId: string,
  source: 'TEACHER_MANUAL' | 'ADMIN_MANUAL',
) {
  const observation = await prisma.$transaction(async (tx) => {
    const created = await tx.developmentObservation.create({
      data: {
        studentId,
        areaId,
        observation: input.observation.trim(),
        observedOn: input.observedOn ? new Date(`${input.observedOn}T00:00:00.000Z`) : new Date(),
        observerId,
        source,
      },
    });

    await tx.studentDevelopmentArea.upsert({
      where: { studentId_areaId: { studentId, areaId } },
      create: { studentId, areaId },
      update: {},
    });

    return created;
  });

  await audit({
    actorId: observerId,
    action: 'DEVELOPMENT_OBSERVATION_ADDED',
    entity: 'Student',
    entityId: studentId,
    after: { areaId, observationId: observation.id },
  });

  return getAreaEvidence(studentId, areaId);
}

/**
 * Stage changes are recorded as their own event so the history shows not just
 * where a child is, but when the school's reading of it changed and why.
 */
export async function updateStage(
  studentId: string,
  areaId: string,
  input: { stage: DevStage; observationId?: string },
  actorId: string,
) {
  const existing = await prisma.studentDevelopmentArea.findUnique({
    where: { studentId_areaId: { studentId, areaId } },
  });
  const fromStage = existing?.currentStage ?? 'EMERGING';

  await prisma.$transaction(async (tx) => {
    await tx.studentDevelopmentArea.upsert({
      where: { studentId_areaId: { studentId, areaId } },
      create: { studentId, areaId, currentStage: input.stage },
      update: { currentStage: input.stage },
    });

    if (fromStage !== input.stage) {
      await tx.developmentStageChange.create({
        data: {
          studentId,
          areaId,
          fromStage,
          toStage: input.stage,
          changedBy: actorId,
          observationId: input.observationId ?? null,
        },
      });
    }
  });

  await audit({
    actorId,
    action: 'DEVELOPMENT_STAGE_CHANGED',
    entity: 'Student',
    entityId: studentId,
    before: { areaId, stage: fromStage },
    after: { areaId, stage: input.stage },
  });

  return getAreaEvidence(studentId, areaId);
}

/** Recent development evidence, used by the weekly update. */
export async function getRecentObservations(studentId: string, since: Date) {
  return prisma.developmentObservation.findMany({
    where: { studentId, observedOn: { gte: since } },
    orderBy: { observedOn: 'desc' },
    include: { area: true },
  });
}
