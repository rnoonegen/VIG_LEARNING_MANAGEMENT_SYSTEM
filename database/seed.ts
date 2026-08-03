/**
 * Demo seed for the Valmiki LMS System.
 *
 * Runs in two phases:
 *
 *   1. Reference data — school settings, development areas and the curriculum.
 *      Needs only the database.
 *   2. Demo data — accounts, students, a timetable and one fully saved class
 *      record that flows through to a parent weekly update. Needs Supabase Auth,
 *      because every account is a real Supabase user.
 *
 * If Supabase is not configured the script still seeds phase 1 and explains what
 * is missing, so schema work is never blocked on credentials.
 *
 * Usage: npm run db:seed
 */

import { PrismaClient, type Prisma } from '@prisma/client';
import { SEED_DEVELOPMENT_AREAS, accountUsername, addDays, splitName, startOfWeek } from '@vig/shared';
import { env, supabaseConfigured } from '../backend/src/env.js';
import { supabaseAdmin, usernameToEmail } from '../backend/src/lib/supabase.js';
import { recordState } from '../backend/src/modules/classrecord/window.js';

const prisma = new PrismaClient();

/**
 * Demo accounts share one password so the prototype can be explored immediately.
 * They are created with must_change_password = false for that reason; accounts
 * created through the UI still go through the forced-replacement gate (F1).
 */
const DEMO_PASSWORD = 'Valmiki@2026';

// ---------------------------------------------------------------------------
// Phase 1 — reference data
// ---------------------------------------------------------------------------

async function seedSchoolSettings() {
  await prisma.schoolSettings.upsert({
    where: { id: 1 },
    create: { id: 1, name: 'Valmiki International Gurukulam', timezone: env.SCHOOL_TIMEZONE },
    update: { timezone: env.SCHOOL_TIMEZONE },
  });
  console.log('  · school settings');
}

async function seedDevelopmentAreas() {
  for (const [index, area] of SEED_DEVELOPMENT_AREAS.entries()) {
    await prisma.developmentArea.upsert({
      where: { category_name: { category: area.category, name: area.name } },
      create: { ...area, displayOrder: index },
      update: { description: area.description },
    });
  }
  console.log(`  · ${SEED_DEVELOPMENT_AREAS.length} development areas`);
}

/**
 * Subject → four levels → headings → sub-headings.
 *
 * Every subject has the same four named levels and nothing else, matching what
 * the app creates for a new subject. Headings and sub-headings are normally
 * typed by the admin or the assigned teacher; a couple are seeded here only so
 * the demo has a class to record against and something to tick students off
 * with.
 */
const DEMO_LEVEL_NAMES = ['Valmiki', 'Vasishta', 'Vishwamitra', 'Vishwakarma'];

const CURRICULUM: Array<{
  name: string;
  colorToken: string;
  /** Which of the four levels carries the demo content, and what it contains. */
  contentLevel?: { name: string; topics: Array<{ name: string; skills: string[] }> };
}> = [
  {
    name: 'Mathematics',
    colorToken: 'violet',
    contentLevel: {
      name: 'Vishwamitra',
      topics: [
        {
          name: 'Fractions',
          skills: [
            'Equivalent fractions',
            'Adding unlike fractions',
            'Subtracting fractions',
            'Multiplying fractions',
          ],
        },
        { name: 'Decimals', skills: ['Place value to thousandths', 'Comparing decimals', 'Rounding decimals'] },
        { name: 'Geometry', skills: ['Angles and lines', 'Area of rectangles', 'Perimeter', 'Symmetry'] },
      ],
    },
  },
  {
    name: 'English',
    colorToken: 'orange',
    contentLevel: {
      name: 'Vasishta',
      topics: [
        { name: 'Paragraph Writing', skills: ['Topic sentences', 'Supporting detail', 'Concluding sentences'] },
        { name: 'Reading Comprehension', skills: ['Main idea', 'Inference', 'Vocabulary in context'] },
      ],
    },
  },
  {
    name: 'Science',
    colorToken: 'blue',
    contentLevel: {
      name: 'Vasishta',
      topics: [
        { name: 'Materials & Properties', skills: ['States of matter', 'Mixtures and solutions', 'Reversible change'] },
        { name: 'Living Things', skills: ['Life cycles', 'Habitats'] },
      ],
    },
  },
  { name: 'Telugu', colorToken: 'green' },
];

async function seedCurriculum() {
  for (const [subjectOrder, subjectSpec] of CURRICULUM.entries()) {
    const subject = await prisma.subject.upsert({
      where: { name: subjectSpec.name },
      create: { name: subjectSpec.name, colorToken: subjectSpec.colorToken, displayOrder: subjectOrder },
      update: { colorToken: subjectSpec.colorToken },
    });

    for (const [levelOrder, levelName] of DEMO_LEVEL_NAMES.entries()) {
      const level = await prisma.level.upsert({
        where: { subjectId_name: { subjectId: subject.id, name: levelName } },
        create: { subjectId: subject.id, name: levelName, displayOrder: levelOrder },
        update: { displayOrder: levelOrder },
      });

      const topics = subjectSpec.contentLevel?.name === levelName ? subjectSpec.contentLevel.topics : [];

      for (const [topicOrder, topicSpec] of topics.entries()) {
        const existingTopic = await prisma.topic.findFirst({
          where: { levelId: level.id, name: topicSpec.name },
        });
        const topic =
          existingTopic ??
          (await prisma.topic.create({
            data: { levelId: level.id, name: topicSpec.name, displayOrder: topicOrder },
          }));

        for (const [skillOrder, skillName] of topicSpec.skills.entries()) {
          const existingSkill = await prisma.skill.findFirst({
            where: { topicId: topic.id, name: skillName },
          });
          if (!existingSkill) {
            await prisma.skill.create({
              data: { topicId: topic.id, name: skillName, displayOrder: skillOrder },
            });
          }
        }
      }
    }
  }

  const [subjects, skills] = await Promise.all([prisma.subject.count(), prisma.skill.count()]);
  console.log(`  · ${subjects} subjects, ${skills} skills`);
}

// ---------------------------------------------------------------------------
// Phase 2 — demo accounts and the full information cycle
// ---------------------------------------------------------------------------

type Role = 'ADMIN' | 'TEACHER' | 'PARENT';

/** Creates (or reuses) a Supabase Auth user and the matching local row. */
async function ensureUser(username: string, fullName: string, role: Role) {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing;

  const email = usernameToEmail(username);
  const admin = supabaseAdmin();

  let authId: string;
  const created = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });

  if (created.data.user) {
    authId = created.data.user.id;
  } else {
    // The auth user may survive a previous partial run; find and reuse it.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = list?.users.find((u) => u.email === email);
    if (!match) throw new Error(`Could not create or find the auth user for ${username}: ${created.error?.message}`);
    await admin.auth.admin.updateUserById(match.id, { password: DEMO_PASSWORD });
    authId = match.id;
  }

  const user = await prisma.user.create({
    data: { id: authId, username, emailAlias: email, role, fullName, mustChangePassword: false },
  });

  if (role === 'TEACHER') await prisma.teacher.create({ data: { userId: user.id } });
  if (role === 'PARENT') await prisma.parent.create({ data: { userId: user.id } });

  return user;
}

const WEEKDAYS = [1, 2, 3, 4, 5];

function weekWindows(startTime: string, endTime: string) {
  return WEEKDAYS.map((weekday) => ({ weekday, startTime, endTime }));
}

async function seedDemo() {
  // --- Accounts ------------------------------------------------------------
  const adminUser = await ensureUser('anjali', 'Anjali Rao', 'ADMIN');
  const priyaUser = await ensureUser('priya', 'Priya Sharma', 'TEACHER');
  const meeraUser = await ensureUser('meera', 'Meera Reddy', 'TEACHER');
  // Holds a subject but has no class yet — the case where a teacher sees their
  // students through capability alone, before anything is scheduled.
  const rohitUser = await ensureUser('rohit', 'Rohit Verma', 'TEACHER');
  const parentUser = await ensureUser('ananya', 'Ananya Sharma', 'PARENT');
  // A second parent, linked to two children, so the sibling case is exercised.
  const parent2User = await ensureUser('vikram', 'Vikram Rao', 'PARENT');
  console.log('  · 6 accounts (admin, 3 teachers, 2 parents)');

  const priya = await prisma.teacher.findUniqueOrThrow({ where: { userId: priyaUser.id } });
  const meera = await prisma.teacher.findUniqueOrThrow({ where: { userId: meeraUser.id } });
  const rohit = await prisma.teacher.findUniqueOrThrow({ where: { userId: rohitUser.id } });
  const parent = await prisma.parent.findUniqueOrThrow({ where: { userId: parentUser.id } });
  const parent2 = await prisma.parent.findUniqueOrThrow({ where: { userId: parent2User.id } });

  // The demo accounts predate first/last names and a contact number; fill them
  // in so the Parents screens have the same shape as anything created in-app.
  for (const [record, contact] of [
    [parent, '+91 98765 43210'],
    [parent2, '+91 98765 11223'],
  ] as const) {
    const user = record.id === parent.id ? parentUser : parent2User;
    const { firstName, lastName } = splitName(user.fullName);
    await prisma.parent.update({
      where: { id: record.id },
      data: { firstName, lastName, mobileNumber: contact },
    });
  }

  // The same for teachers, whose details are now collected when they are added.
  // Their usernames stay as they are: priya / meera / rohit are the demo logins,
  // not names the app issued.
  for (const [record, user, dateOfBirth, address] of [
    [priya, priyaUser, '1989-04-12', '14 MG Road, Bengaluru 560001'],
    [meera, meeraUser, '1992-11-03', '7 Jubilee Hills, Hyderabad 500033'],
    [rohit, rohitUser, '1986-07-25', '221 Banjara Hills, Hyderabad 500034'],
  ] as const) {
    const { firstName, lastName } = splitName(user.fullName);
    await prisma.teacher.update({
      where: { id: record.id },
      data: {
        firstName,
        lastName,
        dateOfBirth: new Date(`${dateOfBirth}T00:00:00.000Z`),
        address,
      },
    });
  }

  // --- Teaching capabilities & availability --------------------------------
  const maths = await prisma.subject.findUniqueOrThrow({ where: { name: 'Mathematics' } });
  const english = await prisma.subject.findUniqueOrThrow({ where: { name: 'English' } });
  const science = await prisma.subject.findUniqueOrThrow({ where: { name: 'Science' } });

  // Ranges are level display orders: 0 = Valmiki … 3 = Vishwakarma.
  const telugu = await prisma.subject.findUniqueOrThrow({ where: { name: 'Telugu' } });

  const capabilities: Array<{ teacherId: string; subjectId: string; min: number; max: number; primary: boolean }> = [
    { teacherId: priya.id, subjectId: maths.id, min: 0, max: 3, primary: true },
    { teacherId: priya.id, subjectId: science.id, min: 0, max: 1, primary: false },
    { teacherId: meera.id, subjectId: english.id, min: 0, max: 3, primary: true },
    // Rohit teaches Telugu but has no class: his Students list is populated
    // purely by capability, which is the path added for the teacher flow.
    { teacherId: rohit.id, subjectId: telugu.id, min: 0, max: 3, primary: true },
  ];

  for (const cap of capabilities) {
    await prisma.teacherCapability.upsert({
      where: { teacherId_subjectId: { teacherId: cap.teacherId, subjectId: cap.subjectId } },
      create: {
        teacherId: cap.teacherId,
        subjectId: cap.subjectId,
        minLevelOrder: cap.min,
        maxLevelOrder: cap.max,
        isPrimary: cap.primary,
      },
      update: {},
    });
  }

  for (const teacher of [priya, meera, rohit]) {
    const count = await prisma.teacherAvailability.count({ where: { teacherId: teacher.id } });
    if (count === 0) {
      await prisma.teacherAvailability.createMany({
        data: weekWindows('08:30', '14:30').map((w) => ({ ...w, teacherId: teacher.id })),
      });
    }
  }
  console.log('  · teaching capabilities and weekly availability');

  // --- Students -------------------------------------------------------------
  // The levels carrying demo headings, so the class has something to tick.
  const mathsLevel = await prisma.level.findUniqueOrThrow({
    where: { subjectId_name: { subjectId: maths.id, name: 'Vishwamitra' } },
  });
  const englishLevel = await prisma.level.findUniqueOrThrow({
    where: { subjectId_name: { subjectId: english.id, name: 'Vasishta' } },
  });
  const scienceLevel = await prisma.level.findUniqueOrThrow({
    where: { subjectId_name: { subjectId: science.id, name: 'Vasishta' } },
  });

  const teluguLevel = await prisma.level.findUniqueOrThrow({
    where: { subjectId_name: { subjectId: telugu.id, name: 'Valmiki' } },
  });

  /**
   * Deliberately varied, so every branch of the student flow has a subject:
   * a child whose parent has two children, one with no parent linked at all,
   * and one carrying Telugu — a subject nobody has a class for yet.
   */
  const studentSpecs: Array<{
    fullName: string;
    gradeLabel: string;
    parents: Array<{ parentId: string; relationship: string }>;
    subjects: Array<{ subjectId: string; levelId: string }>;
  }> = [
    {
      fullName: 'Aarav Sharma',
      gradeLabel: '5th Grade',
      parents: [{ parentId: parent.id, relationship: 'Mother' }],
      subjects: [
        { subjectId: maths.id, levelId: mathsLevel.id },
        { subjectId: english.id, levelId: englishLevel.id },
        { subjectId: science.id, levelId: scienceLevel.id },
      ],
    },
    {
      fullName: 'Diya Rao',
      gradeLabel: '5th Grade',
      parents: [{ parentId: parent2.id, relationship: 'Father' }],
      subjects: [
        { subjectId: maths.id, levelId: mathsLevel.id },
        { subjectId: english.id, levelId: englishLevel.id },
        // Assigned but unscheduled — surfaces under "Subjects with no teacher yet".
        { subjectId: telugu.id, levelId: teluguLevel.id },
      ],
    },
    {
      // The sibling: same parent account as Diya, so one login covers two children.
      fullName: 'Ishaan Rao',
      gradeLabel: '3rd Grade',
      parents: [{ parentId: parent2.id, relationship: 'Father' }],
      subjects: [{ subjectId: telugu.id, levelId: teluguLevel.id }],
    },
    {
      // No parent linked — the "nobody at home can see this child" warning.
      fullName: 'Kabir Singh',
      gradeLabel: '4th Grade',
      parents: [],
      subjects: [
        { subjectId: maths.id, levelId: mathsLevel.id },
        { subjectId: science.id, levelId: scienceLevel.id },
      ],
    },
  ];

  const students = [];
  for (const spec of studentSpecs) {
    let student = await prisma.student.findFirst({ where: { fullName: spec.fullName } });
    if (!student) {
      const { firstName, lastName } = splitName(spec.fullName);
      student = await prisma.student.create({
        data: {
          fullName: spec.fullName,
          firstName,
          lastName,
          username: accountUsername('S', firstName, lastName),
          gradeLabel: spec.gradeLabel,
          joinedAt: new Date(),
        },
      });

      await prisma.studentSubjectLevel.createMany({
        data: spec.subjects.map((s) => ({ studentId: student!.id, ...s })),
      });

      await prisma.studentAvailability.createMany({
        data: weekWindows('09:00', '15:00').map((w) => ({ ...w, studentId: student!.id })),
      });

      for (const link of spec.parents) {
        await prisma.parentStudent.create({
          data: { parentId: link.parentId, studentId: student.id, relationship: link.relationship },
        });
      }
    }
    students.push(student);
  }
  console.log(`  · ${students.length} students with levels, availability and parent access`);

  // --- A recurring class, starting last Monday so there is history ----------
  const lastMonday = addDays(startOfWeek(new Date(), 1), -7);
  const startTime = '09:00';
  const durationMinutes = 60;

  let mathsClass = await prisma.class.findFirst({
    where: { subjectId: maths.id, teacherId: priya.id, levelId: mathsLevel.id },
  });

  if (!mathsClass) {
    mathsClass = await prisma.class.create({
      data: {
        subjectId: maths.id,
        levelId: mathsLevel.id,
        teacherId: priya.id,
        daysOfWeek: [1, 3],
        startTime,
        durationMinutes,
        startDate: lastMonday,
        timezone: env.SCHOOL_TIMEZONE,
        createdBy: adminUser.id,
        students: { create: students.slice(0, 2).map((s) => ({ studentId: s.id })) },
      },
    });
  }

  // Materialise occurrences across the whole demo window, past and future.
  const occurrenceData: Prisma.ClassOccurrenceCreateManyInput[] = [];
  for (let offset = 0; offset < 60; offset += 1) {
    const day = addDays(lastMonday, offset);
    if (!mathsClass.daysOfWeek.includes(day.getUTCDay())) continue;

    const start = new Date(day);
    start.setUTCHours(Number(startTime.slice(0, 2)), Number(startTime.slice(3)), 0, 0);
    const end = new Date(start.getTime() + durationMinutes * 60_000);

    occurrenceData.push({
      classId: mathsClass.id,
      scheduledStart: start,
      scheduledEnd: end,
      teacherId: priya.id,
    });
  }
  await prisma.classOccurrence.createMany({ data: occurrenceData, skipDuplicates: true });
  console.log(`  · 1 recurring class, ${occurrenceData.length} occurrences materialised`);

  // --- One class fully recorded, so the cycle is visible end to end ---------
  const pastOccurrence = await prisma.classOccurrence.findFirst({
    where: { classId: mathsClass.id, scheduledEnd: { lt: new Date() } },
    orderBy: { scheduledStart: 'desc' },
    include: { class: { include: { students: true } }, classRecord: true },
  });

  if (pastOccurrence && !pastOccurrence.classRecord) {
    const roster = pastOccurrence.class.students.map((cs) => cs.studentId);
    const aarav = students[0]!;

    const skill = await prisma.skill.findFirstOrThrow({
      where: { name: 'Adding unlike fractions' },
    });
    const confidence = await prisma.developmentArea.findFirstOrThrow({ where: { name: 'Confidence' } });

    const observedOn = new Date(pastOccurrence.scheduledStart);
    observedOn.setUTCHours(0, 0, 0, 0);

    await prisma.$transaction(async (tx) => {
      await tx.attendance.createMany({
        data: roster.map((studentId) => ({
          occurrenceId: pastOccurrence.id,
          studentId,
          status: 'PRESENT' as const,
        })),
        skipDuplicates: true,
      });

      const record = await tx.classRecord.create({
        data: {
          occurrenceId: pastOccurrence.id,
          authorId: priyaUser.id,
          overallClassNote:
            'Worked on adding unlike fractions using visual models, then moved to independent practice. The group found common denominators more comfortably than last week.',
          status: 'SAVED',
          savedAt: new Date(),
          observations: {
            create: [
              {
                studentId: aarav.id,
                observation:
                  'Understood the common denominator quickly and solved the first four examples independently.',
              },
              {
                studentId: roster[1] ?? aarav.id,
                observation: 'Understood the concept but needed prompting on the word problem.',
              },
            ],
          },
        },
      });

      await tx.learningUpdate.create({
        data: {
          studentId: aarav.id,
          skillId: skill.id,
          previousStatus: 'LEARNING',
          newStatus: 'MASTERED',
          note: 'Solved four examples independently without prompting.',
          source: 'CLASS_RECORD',
          classRecordId: record.id,
          authorId: priyaUser.id,
        },
      });

      await tx.studentSkillProgress.upsert({
        where: { studentId_skillId: { studentId: aarav.id, skillId: skill.id } },
        create: { studentId: aarav.id, skillId: skill.id, status: 'MASTERED', updatedBy: priyaUser.id },
        update: { status: 'MASTERED', updatedBy: priyaUser.id },
      });

      await tx.developmentObservation.create({
        data: {
          studentId: aarav.id,
          areaId: confidence.id,
          observation: 'Volunteered to explain his solution method to the group without being asked.',
          observedOn,
          observerId: priyaUser.id,
          classRecordId: record.id,
          source: 'CLASS_RECORD',
        },
      });

      await tx.studentDevelopmentArea.upsert({
        where: { studentId_areaId: { studentId: aarav.id, areaId: confidence.id } },
        create: { studentId: aarav.id, areaId: confidence.id, currentStage: 'DEVELOPING' },
        update: { currentStage: 'DEVELOPING' },
      });

      await tx.classOccurrence.update({
        where: { id: pastOccurrence.id },
        data: { status: 'COMPLETED' },
      });
    });

    console.log('  · 1 saved class record → learning update + development evidence');
  }

  // --- Class-record states: one still due, one missed for good --------------
  //
  // A record may be written from the class's start until 09:00 the next morning.
  // Both sides of that deadline need to exist in the demo: one class a teacher
  // can still write up, and one whose deadline has gone — which is what puts a
  // count on Teacher Home and a notification in front of the admin.
  let englishClass = await prisma.class.findFirst({
    where: { subjectId: english.id, teacherId: meera.id, levelId: englishLevel.id },
  });

  if (!englishClass) {
    englishClass = await prisma.class.create({
      data: {
        subjectId: english.id,
        levelId: englishLevel.id,
        teacherId: meera.id,
        daysOfWeek: [2, 4],
        startTime: '11:00',
        durationMinutes: 60,
        startDate: lastMonday,
        timezone: env.SCHOOL_TIMEZONE,
        createdBy: adminUser.id,
        students: { create: students.slice(0, 2).map((s) => ({ studentId: s.id })) },
      },
    });
  }

  /**
   * Both states are guaranteed on every run, not only the first.
   *
   * Recording a class consumes the "due" one, so a re-seed has to top it up —
   * otherwise the second person to try the demo finds nothing to record. Each is
   * created only when the state is genuinely absent, so re-seeding does not pile
   * up occurrences.
   */
  const now = new Date();
  const seedOccurrence = async (start: Date) => {
    await prisma.classOccurrence.create({
      data: {
        classId: englishClass!.id,
        scheduledStart: start,
        scheduledEnd: new Date(+start + 60 * 60 * 1000),
        teacherId: meera.id,
      },
    });
  };

  const englishOccurrences = await prisma.classOccurrence.findMany({
    where: { classId: englishClass.id, scheduledStart: { lt: now } },
    include: { classRecord: { select: { status: true } } },
  });

  const states = englishOccurrences.map((o) => recordState(o.scheduledStart, o.classRecord?.status, now));
  if (!states.includes('OPEN')) await seedOccurrence(new Date(+now - 2 * 60 * 60 * 1000));
  if (!states.includes('CLOSED')) await seedOccurrence(new Date(+now - 3 * 24 * 60 * 60 * 1000));

  console.log('  · English class · 1 record still due, 1 already missed');

  // --- A teacher exception, to demonstrate grouped Needs Attention ----------
  const nextFriday = addDays(startOfWeek(new Date(), 1), 11);
  const hasException = await prisma.teacherAvailabilityException.findFirst({
    where: { teacherId: priya.id, date: nextFriday },
  });
  if (!hasException) {
    await prisma.teacherAvailabilityException.create({
      data: {
        teacherId: priya.id,
        date: nextFriday,
        isAvailable: false,
        allDay: false,
        startTime: '08:30',
        endTime: '12:00',
        reason: 'Personal appointment',
      },
    });
  }
  console.log('  · 1 teacher availability exception');
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('\nSeeding Valmiki LMS System\n');

  console.log('Reference data:');
  await seedSchoolSettings();
  await seedDevelopmentAreas();
  await seedCurriculum();

  if (!supabaseConfigured) {
    console.log(
      '\nSkipping demo accounts and the class-record cycle.\n' +
        'Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env,\n' +
        'then run `npm run db:seed` again to create them.\n',
    );
    return;
  }

  console.log('\nDemo data:');
  await seedDemo();

  console.log(`\nDone. Sign in with any of these — password: ${DEMO_PASSWORD}\n`);
  console.log('  anjali  · Admin   · Anjali Rao');
  console.log('  priya   · Teacher · Priya Sharma   (Maths + Science · has classes)');
  console.log('  meera   · Teacher · Meera Reddy    (English · 1 record due, 1 missed)');
  console.log('  rohit   · Teacher · Rohit Verma    (Telugu · students by capability, no class yet)');
  console.log('  ananya  · Parent  · Ananya Sharma  (Aarav)');
  console.log('  vikram  · Parent  · Vikram Rao     (Diya + Ishaan — two children)\n');
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
