#!/usr/bin/env node
/**
 * Valmiki LMS — one-command environment bootstrap.
 *
 *   npm run setup           check everything, then create and seed the database
 *   npm run setup -- --check    preflight only, change nothing
 *   npm run setup -- --no-seed  create the schema but skip demo data
 *
 * The point of this script is diagnosis, not just execution. Every step reports
 * what it checked and, when something fails, exactly which value to fix and
 * where to find it — a raw `prisma migrate` failure against a bad connection
 * string is famously unhelpful.
 *
 * Safe to re-run: migrations and the seed are both idempotent.
 */

import { config } from 'dotenv';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const SKIP_SEED = args.includes('--no-seed');

// --- Output helpers ---------------------------------------------------------

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  violet: '\x1b[35m',
};

const ok = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow}!${c.reset} ${msg}`);
const fail = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`);
const note = (msg) => console.log(`    ${c.dim}${msg}${c.reset}`);
const step = (n, title) => console.log(`\n${c.violet}${c.bold}${n}. ${title}${c.reset}`);

/** Collected blocking problems; nothing destructive runs while this is non-empty. */
const blockers = [];

function run(command, label) {
  note(`$ ${command}`);
  try {
    execSync(command, { cwd: ROOT, stdio: 'inherit' });
    ok(label);
    return true;
  } catch {
    fail(`${label} — command failed`);
    return false;
  }
}

// --- 1. Environment file ----------------------------------------------------

step(1, 'Environment file');

if (!existsSync(ENV_PATH)) {
  fail('.env not found');
  note('Copy the template first:  cp .env.example .env');
  process.exit(1);
}
config({ path: ENV_PATH });
ok('.env loaded');

/** Values that ship as placeholders and must be replaced before anything works. */
const PLACEHOLDER = /REPLACE_ME|YOUR_PROJECT_REF|\[YOUR-PASSWORD\]|\[REGION\]/;

const REQUIRED = [
  ['DATABASE_URL', 'Dashboard → Project Settings → Database → Connection string → Transaction pooler (port 6543)'],
  ['DIRECT_URL', 'Dashboard → Project Settings → Database → Connection string → Direct connection (port 5432)'],
  ['SUPABASE_URL', 'Dashboard → Project Settings → API → Project URL'],
  ['SUPABASE_ANON_KEY', 'Dashboard → Project Settings → API → anon / publishable key'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Dashboard → Project Settings → API → service_role / secret key'],
];

for (const [key, where] of REQUIRED) {
  const value = process.env[key];
  if (!value) {
    fail(`${key} is not set`);
    note(where);
    blockers.push(key);
  } else if (PLACEHOLDER.test(value)) {
    fail(`${key} still contains a placeholder`);
    note(where);
    blockers.push(key);
  } else {
    // Never print a secret — just enough to confirm the right value landed.
    ok(`${key} ${c.dim}(${value.length} chars, ends …${value.slice(-6)})${c.reset}`);
  }
}

// --- 2. Supabase reachability ----------------------------------------------

step(2, 'Supabase Auth');

if (blockers.includes('SUPABASE_URL') || blockers.includes('SUPABASE_SERVICE_ROLE_KEY')) {
  warn('skipped — credentials incomplete');
} else {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const health = await fetch(`${base}/auth/v1/health`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY ?? '' },
      signal: AbortSignal.timeout(15_000),
    });
    if (health.ok) {
      const body = await health.json().catch(() => ({}));
      ok(`Auth reachable ${c.dim}(GoTrue ${body.version ?? 'unknown'})${c.reset}`);
    } else {
      fail(`Auth returned HTTP ${health.status}`);
      blockers.push('SUPABASE_URL');
    }
  } catch (error) {
    fail(`Cannot reach ${base} — ${error.message}`);
    blockers.push('SUPABASE_URL');
  }

  // The service-role key is what the seed uses to create accounts; verifying it
  // now avoids failing halfway through seeding.
  try {
    const admin = await fetch(`${base}/auth/v1/admin/users?per_page=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (admin.ok) ok('service_role key accepted');
    else {
      fail(`service_role key rejected (HTTP ${admin.status})`);
      blockers.push('SUPABASE_SERVICE_ROLE_KEY');
    }
  } catch (error) {
    fail(`Admin API unreachable — ${error.message}`);
    blockers.push('SUPABASE_SERVICE_ROLE_KEY');
  }
}

// --- 3. Prisma client -------------------------------------------------------

step(3, 'Prisma client');

if (!run('npx prisma generate --schema database/schema.prisma', 'client generated')) {
  note('On Windows this fails if a dev server is holding the engine DLL.');
  note('Stop `npm run dev` and try again.');
  process.exit(1);
}

// --- 4. Database connectivity ----------------------------------------------

step(4, 'Database connection');

if (blockers.includes('DATABASE_URL') || blockers.includes('DIRECT_URL')) {
  warn('skipped — connection string incomplete');
} else {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ log: [] });
  try {
    await prisma.$queryRaw`SELECT 1`;
    ok('Postgres reachable');
  } catch (error) {
    fail('Cannot connect to Postgres');
    const message = String(error.message ?? error);
    if (/password authentication failed|not valid/i.test(message)) {
      note('The database password is wrong. It is NOT the anon or service_role key —');
      note('it is set under Project Settings → Database → Database password.');
    } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
      note('Host did not resolve. Check the region in the pooler hostname.');
    } else if (/ENETUNREACH|ECONNREFUSED|timeout/i.test(message)) {
      note('Unreachable. Supabase direct connections are IPv6-only — if your');
      note('network is IPv4-only, use the Session pooler string for DIRECT_URL.');
    } else {
      note(message.split('\n')[0]);
    }
    blockers.push('DATABASE_URL');
  } finally {
    await prisma.$disconnect();
  }
}

// --- Gate -------------------------------------------------------------------

if (blockers.length > 0) {
  console.log(
    `\n${c.red}${c.bold}Stopped.${c.reset} Fix in .env: ${c.bold}${[...new Set(blockers)].join(', ')}${c.reset}`,
  );
  console.log(`${c.dim}Nothing was changed. Re-run:  npm run setup${c.reset}\n`);
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log(`\n${c.green}${c.bold}All checks passed.${c.reset} Run ${c.bold}npm run setup${c.reset} to create the database.\n`);
  process.exit(0);
}

// --- 5. Schema --------------------------------------------------------------

step(5, 'Database schema');

// SQL-first: database/supabase/schema/*.sql is the source of truth, applied in
// numeric order. Prisma Migrate is not used — see database/supabase/schema/README.md.
if (!run('node scripts/apply-sql-schema.mjs', '39 tables + RLS + storage applied')) {
  process.exit(1);
}

// Keep the Prisma Client's view of the database in step with the SQL that was
// just applied. Without this the generated types drift from the real columns.
if (!run('npx prisma db pull --schema database/schema.prisma', 'schema.prisma synced from database')) {
  note('Non-fatal, but run `npm run db:pull` before relying on Prisma types.');
}
run('npx prisma generate --schema database/schema.prisma', 'client regenerated');

// --- 6. Seed ----------------------------------------------------------------

if (SKIP_SEED) {
  step(6, 'Seed');
  warn('skipped (--no-seed)');
} else {
  step(6, 'Seed data');
  if (!run('npx tsx database/seed.ts', 'curriculum, accounts and demo timetable created')) {
    process.exit(1);
  }
}

// --- Done -------------------------------------------------------------------

console.log(`\n${c.green}${c.bold}Setup complete.${c.reset}\n`);
console.log(`  Start the app:   ${c.bold}npm run dev${c.reset}`);
console.log(`  Frontend:        http://localhost:3000`);
console.log(`  API health:      http://localhost:4000/api/v1/health\n`);

if (!SKIP_SEED) {
  console.log(`  ${c.dim}Demo sign-in — admin ${c.reset}${c.bold}anjali${c.reset}${c.dim}, password ${c.reset}${c.bold}Valmiki@2026${c.reset}`);
  console.log(`  ${c.dim}Teachers: priya, meera · Parent: ananya · same password${c.reset}`);
  console.log(`  ${c.dim}Demo accounts skip the forced password change; real ones do not.${c.reset}\n`);
}
