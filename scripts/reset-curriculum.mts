#!/usr/bin/env tsx
/**
 * Clears the curriculum and everything built on top of it.
 *
 *   npm run curriculum:reset -- --dry    count what would go, delete nothing
 *   npm run curriculum:reset -- --yes    do it
 *
 * Subjects cannot be deleted while classes reference them, and student progress
 * has no meaning once the skills it points at are gone — so this is deliberately
 * a single, whole-hearted reset rather than a partial one:
 *
 *   goes    curriculum (subjects → levels → topics → skills), teacher
 *           capabilities, student subject levels, skill progress, learning
 *           history, level completions, classes, occurrences, attendance, class
 *           records and observations, weekly updates, scheduling requests
 *   stays   users, teachers, students, parents and their links, availability,
 *           development areas and observations, moments (their subject and class
 *           links are cleared, the photos remain), notifications, audit log
 *
 * There is no undo. Take a database backup first.
 */

import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env') });

const DRY = process.argv.includes('--dry');
const CONFIRMED = process.argv.includes('--yes');

const prisma = new PrismaClient();

async function counts() {
  const [
    subjects,
    levels,
    topics,
    skills,
    capabilities,
    studentLevels,
    progress,
    learningUpdates,
    levelCompletions,
    classes,
    occurrences,
    attendance,
    classRecords,
    observations,
    weeklyUpdates,
    moments,
  ] = await Promise.all([
    prisma.subject.count(),
    prisma.level.count(),
    prisma.topic.count(),
    prisma.skill.count(),
    prisma.teacherCapability.count(),
    prisma.studentSubjectLevel.count(),
    prisma.studentSkillProgress.count(),
    prisma.learningUpdate.count(),
    prisma.levelCompletion.count(),
    prisma.class.count(),
    prisma.classOccurrence.count(),
    prisma.attendance.count(),
    prisma.classRecord.count(),
    prisma.studentObservation.count(),
    prisma.weeklyUpdate.count(),
    prisma.moment.count(),
  ]);

  return {
    subjects,
    levels,
    topics,
    skills,
    capabilities,
    studentLevels,
    progress,
    learningUpdates,
    levelCompletions,
    classes,
    occurrences,
    attendance,
    classRecords,
    observations,
    weeklyUpdates,
    moments,
  };
}

const before = await counts();

console.log('\nCurrent rows');
for (const [key, value] of Object.entries(before)) {
  console.log(`  ${key.padEnd(18)} ${value}`);
}
console.log('\n  (moments are kept — only their subject and class links are cleared)\n');

if (DRY || !CONFIRMED) {
  console.log(DRY ? 'Dry run — nothing deleted.\n' : 'Refusing to delete without --yes.\n');
  await prisma.$disconnect();
  process.exit(0);
}

/**
 * Order follows the foreign keys, deepest first. Several of these would cascade
 * anyway; doing each one explicitly means the script says exactly what it did.
 */
await prisma.$transaction(async (tx) => {
  // Learning history and the progress projection built from it.
  await tx.learningUpdate.deleteMany({});
  await tx.studentSkillProgress.deleteMany({});
  await tx.levelCompletion.deleteMany({});
  await tx.studentSubjectLevel.deleteMany({});

  // Class records. Development observations survive, so their record link is
  // cleared rather than cascading the observation away with it.
  await tx.developmentObservation.updateMany({
    where: { classRecordId: { not: null } },
    data: { classRecordId: null },
  });
  await tx.studentObservation.deleteMany({});
  await tx.classRecord.deleteMany({});

  // A moment is a photograph of a child; it outlives the class it came from.
  await tx.moment.updateMany({
    where: { OR: [{ classOccurrenceId: { not: null } }, { subjectId: { not: null } }] },
    data: { classOccurrenceId: null, subjectId: null },
  });

  // The schedule itself.
  await tx.attendance.deleteMany({});
  await tx.classOccurrence.deleteMany({});
  await tx.classStudent.deleteMany({});
  await tx.class.deleteMany({});
  await tx.scheduleChangeProposal.deleteMany({});
  await tx.schedulingRequest.deleteMany({});

  // Weekly updates summarise learning that no longer exists.
  await tx.weeklyUpdateItem.deleteMany({});
  await tx.weeklyUpdate.deleteMany({});

  // Who can teach what is stated in terms of subjects and level ranges.
  await tx.teacherCapability.deleteMany({});

  // The curriculum itself.
  await tx.skill.deleteMany({});
  await tx.topic.deleteMany({});
  await tx.level.deleteMany({});
  await tx.subject.deleteMany({});
});

const after = await counts();
console.log('Remaining rows');
for (const [key, value] of Object.entries(after)) {
  console.log(`  ${key.padEnd(18)} ${value}`);
}

await prisma.$disconnect();
console.log('\nCurriculum reset complete.\n');
