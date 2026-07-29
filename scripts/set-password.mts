/**
 * Sets one account's password from the command line.
 *
 * The reason this exists: `db:seed` creates its demo accounts on a shared
 * password that is hardcoded in `database/seed.ts`, and therefore public in any
 * repository holding this code. That is harmless in development and unacceptable
 * the moment the same database is reachable from the internet. Rotating those
 * passwords needs a path that does not require already being signed in.
 *
 *   $env:NEW_PASSWORD = '...'          # PowerShell
 *   npm run password:set -- --username priya
 *
 *   npm run password:set -- --username priya --random    # generated and printed
 *
 * Prefer --random for accounts you are handing to someone else: it prints once,
 * here, and the holder replaces it at first sign-in.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { supabaseConfigured } from '../backend/src/env.js';
import { supabaseAdmin } from '../backend/src/lib/supabase.js';

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

/** Same shape the app issues for temporary passwords — no ambiguous glyphs. */
function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const body = Array.from(randomBytes(9), (b) => alphabet[b % alphabet.length]).join('');
  return `Vig-${body}`;
}

const username = arg('--username')?.trim().toLowerCase();
const useRandom = process.argv.includes('--random');
// A password the holder chose is theirs to keep; one this script generated is
// not, so it defaults to requiring replacement at next sign-in.
const mustChange = process.argv.includes('--must-change') || useRandom;

if (!username) fail('Missing --username. Example: npm run password:set -- --username priya --random');
if (!supabaseConfigured) fail('Supabase credentials are missing or still placeholders.');

const password = useRandom ? generatePassword() : process.env.NEW_PASSWORD;
if (!password) fail('Set NEW_PASSWORD in the environment, or pass --random to generate one.');
if (password.length < 8) fail('NEW_PASSWORD must be at least 8 characters.');

const user = await prisma.user.findUnique({
  where: { username },
  select: { id: true, fullName: true, role: true },
});
if (!user) fail(`No account with the username "${username}".`);

// users.id is the Supabase uid, which is what makes this a single update rather
// than a lookup by email alias.
const { error } = await supabaseAdmin().auth.admin.updateUserById(user.id, { password });
if (error) fail(`Could not update the password: ${error.message}`);

await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: mustChange } });
await prisma.$disconnect();

console.log(`
  ✓ Password updated for ${username} (${user.role} · ${user.fullName})
${useRandom ? `\n    New password   ${password}\n` : ''}${
  mustChange ? '    They must replace it at their next sign-in.\n' : ''
}`);
