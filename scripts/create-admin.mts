/**
 * Creates a single administrator account — the production bootstrap.
 *
 * Account creation in the app requires an existing admin (§2), so a brand-new
 * database has no way in. `db:seed` solves that for development by creating
 * demo accounts on a shared, publicly known password; that is not something to
 * run against a live school. This script is the production path: one admin,
 * with a password the operator chooses, and nothing else.
 *
 *   npm run admin:create -- --username anjali --name "Anjali Rao"
 *
 * The password is read from ADMIN_PASSWORD so it never lands in shell history
 * or a process list. Pass --must-change to force a replacement at first login
 * (use it when someone other than the account holder ran this).
 */
import { PrismaClient } from '@prisma/client';
import { supabaseConfigured } from '../backend/src/env.js';
import { supabaseAdmin, usernameToEmail } from '../backend/src/lib/supabase.js';

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

const username = arg('--username')?.trim().toLowerCase();
const fullName = arg('--name')?.trim();
const password = process.env.ADMIN_PASSWORD;
const mustChangePassword = process.argv.includes('--must-change');

if (!username) fail('Missing --username. Example: npm run admin:create -- --username anjali --name "Anjali Rao"');
if (!fullName) fail('Missing --name.');
if (!password) fail('Set ADMIN_PASSWORD in the environment before running this.');
if (password.length < 8) fail('ADMIN_PASSWORD must be at least 8 characters.');
if (!/^[a-z0-9._-]+$/.test(username)) {
  fail('Username may contain only lowercase letters, numbers, dot, underscore and hyphen.');
}
if (!supabaseConfigured) {
  fail('Supabase credentials are missing or still placeholders. Fill them in before creating an account.');
}

const existing = await prisma.user.findUnique({ where: { username } });
if (existing) fail(`The username "${username}" is already taken.`);

const emailAlias = usernameToEmail(username);
const admin = supabaseAdmin();

// Supabase Auth is email-keyed, so the account is created against the synthetic
// non-routable alias the login endpoint resolves usernames to (AD-02).
const { data, error } = await admin.auth.admin.createUser({
  email: emailAlias,
  password,
  email_confirm: true,
  user_metadata: { username, full_name: fullName },
});

if (error || !data.user) {
  fail(`Could not create the auth account: ${error?.message ?? 'unknown error'}`);
}

try {
  // The local id is the Supabase uid — that pairing is what lets the API verify
  // a token against Supabase while reading role and status from our own tables.
  await prisma.user.create({
    data: {
      id: data.user.id,
      username,
      emailAlias,
      role: 'ADMIN',
      fullName,
      mustChangePassword,
    },
  });
} catch (err) {
  // Never leave Supabase Auth and the users table disagreeing about who exists.
  await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
  fail(`Could not create the user row, so the auth account was rolled back: ${String(err)}`);
}

await prisma.$disconnect();

console.log(`
  ✓ Administrator created

    Username   ${username}
    Name       ${fullName}
    Password   the value of ADMIN_PASSWORD${mustChangePassword ? ' (must be replaced at first sign-in)' : ''}

  Sign in, then create the remaining accounts from Accounts in the app.
`);
