import { accountUsername, type AccountPrefix } from '@vig/shared';
import { prisma } from '../prisma.js';

/**
 * The school issues account names; nobody picks their own (AD-02).
 *
 * The shape comes from @vig/shared so the form can show the admin what the
 * account will be called before they commit. Only the API can see collisions
 * though — two children called Aarav Sharma enrolling in the same year is
 * ordinary, not exceptional — so the name the API returns is the real one.
 */
const MAX_ATTEMPTS = 50;

async function isTakenByUser(candidate: string): Promise<boolean> {
  const found = await prisma.user.findFirst({
    where: { username: { equals: candidate, mode: 'insensitive' } },
    select: { id: true },
  });
  return found !== null;
}

async function isTakenByStudent(candidate: string): Promise<boolean> {
  const found = await prisma.student.findFirst({
    where: { username: { equals: candidate, mode: 'insensitive' } },
    select: { id: true },
  });
  return found !== null;
}

/**
 * P26NagVen, or P26NagVen2 when that is already somebody's.
 *
 * Parent and teacher names must clear the users table; a student roll name only
 * has to be unique among students, because a child never signs in.
 */
export async function issueUsername(
  prefix: AccountPrefix,
  firstName: string,
  lastName: string,
): Promise<string> {
  const base = accountUsername(prefix, firstName, lastName);
  if (!base) throw new Error('Cannot build an account name without a first or last name');

  const isTaken = prefix === 'S' ? isTakenByStudent : isTakenByUser;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}${attempt}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  throw new Error(`Could not find a free account name for ${base}`);
}
