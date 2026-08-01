#!/usr/bin/env tsx
/**
 * Empties the school.
 *
 *   npm run data:reset -- --dry           show what would go, delete nothing
 *   npm run data:reset -- --yes           do it, keeping admins + curriculum
 *   npm run data:reset -- --everything --yes   leave nothing behind
 *
 * Everything a school accumulates is removed: students, parents, teachers, their
 * sign-in accounts, every class and class record, all learning and development
 * history, every moment and every uploaded photograph.
 *
 *   goes    students, parents, teachers (local rows, Supabase Auth accounts and
 *           push subscriptions), classes, occurrences, attendance, class records,
 *           observations, learning history, skill progress, level completions,
 *           development observations and stage changes, moments and their media,
 *           weekly updates, notifications, scheduling requests, the audit log,
 *           and every object in the `moments` and `avatars` storage buckets
 *   stays   admin accounts, school settings, the development-area catalogue, and
 *           the curriculum (subjects → levels → headings → sub-headings)
 *
 * Admin accounts are kept by default so the app is still reachable afterwards.
 *
 * `--everything` additionally removes the curriculum, the development-area
 * catalogue and the admin accounts — a bare database. Nobody can sign in after
 * that: run `npm run admin:create` to make a way back in, then `npm run db:seed`
 * if you want the demo data again.
 *
 * There is no undo. Take a database backup first.
 */

import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env') });

const DRY = process.argv.includes('--dry');
const CONFIRMED = process.argv.includes('--yes');
/** Take the curriculum and the admin accounts too — nothing survives. */
const EVERYTHING = process.argv.includes('--everything');

const prisma = new PrismaClient();

const AUTH_EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN ?? 'users.valmiki.internal';
const BUCKETS = [
  process.env.SUPABASE_STORAGE_BUCKET ?? 'moments',
  process.env.SUPABASE_AVATAR_BUCKET ?? 'avatars',
];

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

async function counts() {
  const [
    users,
    admins,
    teachers,
    parents,
    students,
    classes,
    occurrences,
    classRecords,
    learningUpdates,
    devObservations,
    moments,
    weeklyUpdates,
    notifications,
    auditEntries,
    subjects,
    skills,
    developmentAreas,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.teacher.count(),
    prisma.parent.count(),
    prisma.student.count(),
    prisma.class.count(),
    prisma.classOccurrence.count(),
    prisma.classRecord.count(),
    prisma.learningUpdate.count(),
    prisma.developmentObservation.count(),
    prisma.moment.count(),
    prisma.weeklyUpdate.count(),
    prisma.notification.count(),
    prisma.auditLog.count(),
    prisma.subject.count(),
    prisma.skill.count(),
    prisma.developmentArea.count(),
  ]);

  return {
    users,
    admins,
    teachers,
    parents,
    students,
    classes,
    occurrences,
    classRecords,
    learningUpdates,
    devObservations,
    moments,
    weeklyUpdates,
    notifications,
    auditEntries,
    subjects,
    skills,
    developmentAreas,
  };
}

/** Storage lists one prefix at a time, so folders are walked by hand. */
async function listAllObjects(bucket: string, prefix = ''): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const paths: string[] = [];
  for (const entry of data) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A folder comes back with no id; anything else is an object.
    if (entry.id === null) paths.push(...(await listAllObjects(bucket, full)));
    else paths.push(full);
  }
  return paths;
}

const before = await counts();

console.log('\nCurrent rows');
for (const [key, value] of Object.entries(before)) {
  console.log(`  ${key.padEnd(18)} ${value}`);
}

const objectsByBucket: Record<string, string[]> = {};
for (const bucket of BUCKETS) {
  objectsByBucket[bucket] = await listAllObjects(bucket);
  console.log(`  ${`storage:${bucket}`.padEnd(18)} ${objectsByBucket[bucket]!.length}`);
}

console.log(
  EVERYTHING
    ? `\n  --everything: the curriculum (${before.subjects} subjects, ${before.skills} sub-headings),\n` +
        `  ${before.developmentAreas} development areas and all ${before.admins} admin account(s) go too.\n` +
        `  Nobody will be able to sign in afterwards — run \`npm run admin:create\` to get back in.\n`
    : `\n  ${before.admins} admin account(s), the curriculum and the development areas will be kept.\n` +
        `  Add --everything to remove those as well.\n`,
);

if (DRY || !CONFIRMED) {
  console.log(DRY ? 'Dry run — nothing deleted.\n' : 'Refusing to delete without --yes.\n');
  await prisma.$disconnect();
  process.exit(0);
}

// --- The database ------------------------------------------------------------

// With --everything there is nobody to keep, so the same code path clears the lot.
const keptAdmins = EVERYTHING
  ? []
  : await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, username: true, emailAlias: true },
    });
const keptIds = new Set(keptAdmins.map((a) => a.id));

await prisma.$transaction(async (tx) => {
  // Records first: nearly all of them point at a user, a student or an occurrence.
  await tx.learningUpdate.deleteMany({});
  await tx.studentSkillProgress.deleteMany({});
  await tx.levelCompletion.deleteMany({});
  await tx.studentSubjectLevel.deleteMany({});

  await tx.developmentStageChange.deleteMany({});
  await tx.developmentObservation.deleteMany({});
  await tx.studentDevelopmentArea.deleteMany({});

  await tx.studentObservation.deleteMany({});
  await tx.classRecord.deleteMany({});

  await tx.momentStudent.deleteMany({});
  await tx.momentMedia.deleteMany({});
  await tx.moment.deleteMany({});

  await tx.weeklyUpdateItem.deleteMany({});
  await tx.weeklyUpdate.deleteMany({});

  await tx.attendance.deleteMany({});
  await tx.classOccurrence.deleteMany({});
  await tx.classStudent.deleteMany({});
  await tx.class.deleteMany({});
  await tx.scheduleChangeProposal.deleteMany({});
  await tx.schedulingRequest.deleteMany({});

  // People.
  await tx.parentStudent.deleteMany({});
  await tx.studentAvailability.deleteMany({});
  await tx.student.deleteMany({});

  await tx.teacherCapability.deleteMany({});
  await tx.teacherAvailability.deleteMany({});
  await tx.teacherAvailabilityException.deleteMany({});

  await tx.notification.deleteMany({});
  // The audit log references users; it is history of a school that no longer exists.
  await tx.auditLog.deleteMany({});

  // Teacher and parent rows cascade from their user, which goes last.
  await tx.pushSubscription.deleteMany({ where: { userId: { notIn: [...keptIds] } } });
  await tx.user.deleteMany({ where: { id: { notIn: [...keptIds] } } });

  if (EVERYTHING) {
    // Curriculum last, and innermost first: everything that pointed at a skill,
    // level or subject — progress, classes, capabilities — is already gone above.
    await tx.skill.deleteMany({});
    await tx.topic.deleteMany({});
    await tx.level.deleteMany({});
    await tx.subject.deleteMany({});
    await tx.developmentArea.deleteMany({});
  }
});

console.log('Database cleared.');

// --- Supabase Auth -----------------------------------------------------------

if (supabase) {
  const keptEmails = new Set(keptAdmins.map((a) => a.emailAlias.toLowerCase()));
  const { data: list, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    console.log(`Auth accounts: could not list them (${error.message}). Local rows are gone regardless.`);
  } else {
    // Scoped to this app's synthetic domain, so nothing else in the project is
    // touched. Orphans from earlier runs go too, which is what frees a username
    // to be used again.
    const targets = (list?.users ?? []).filter((u) => {
      const email = (u.email ?? '').toLowerCase();
      return email.endsWith(`@${AUTH_EMAIL_DOMAIN.toLowerCase()}`) && !keptEmails.has(email);
    });

    let removed = 0;
    for (const user of targets) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteError) console.log(`  · could not delete ${user.email}: ${deleteError.message}`);
      else removed += 1;
    }
    console.log(`Auth accounts deleted: ${removed} (kept ${keptEmails.size}).`);
  }

  // --- Storage ---------------------------------------------------------------

  for (const bucket of BUCKETS) {
    const paths = objectsByBucket[bucket] ?? [];
    if (paths.length === 0) {
      console.log(`Storage ${bucket}: already empty.`);
      continue;
    }
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
    console.log(
      removeError
        ? `Storage ${bucket}: ${removeError.message}`
        : `Storage ${bucket}: ${paths.length} files deleted.`,
    );
  }
} else {
  console.log('Supabase is not configured — auth accounts and storage files were left alone.');
}

const after = await counts();
console.log('\nRemaining rows');
for (const [key, value] of Object.entries(after)) {
  console.log(`  ${key.padEnd(18)} ${value}`);
}

await prisma.$disconnect();

console.log(
  keptAdmins.length
    ? `\nReset complete. Sign in as: ${keptAdmins.map((a) => a.username).join(', ')}\n`
    : '\nReset complete. The database is bare — no accounts, no curriculum.\n' +
        '  npm run admin:create   make an administrator so you can sign in\n' +
        '  npm run db:seed        or put the demo school back instead\n',
);
