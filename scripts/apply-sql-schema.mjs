#!/usr/bin/env node
/**
 * Applies database/supabase/schema/*.sql in order, against DATABASE_URL.
 *
 *   npm run schema:apply           apply every file
 *   npm run schema:apply -- --dry  parse and count statements, execute nothing
 *
 * This is the scripted equivalent of pasting each file into the Supabase SQL
 * Editor. Use it to stand up a second project (staging, a colleague's machine)
 * without a Prisma toolchain on the target.
 *
 * Every file is idempotent, so re-running is a no-op — which also makes this
 * the fastest way to verify the folder still matches a live database.
 */

import { config } from 'dotenv';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env') });

const DIR = path.join(ROOT, 'database', 'supabase', 'schema');
const DRY = process.argv.includes('--dry');

const c = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', violet: '\x1b[35m' };

/**
 * Splits SQL into statements on top-level semicolons.
 *
 * Naive splitting on ';' corrupts every DO $$ ... $$ block in 001 and 012,
 * because those bodies contain their own semicolons. This tracks single-quoted
 * strings, line/block comments and dollar-quoted bodies (including tagged ones
 * like $tag$) so only real statement boundaries split.
 */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let dollarTag = null;

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (!inSingle && !dollarTag) {
      if (rest.startsWith('--')) {
        const nl = sql.indexOf('\n', i);
        const end = nl === -1 ? sql.length : nl;
        buf += sql.slice(i, end);
        i = end;
        continue;
      }
      if (rest.startsWith('/*')) {
        const close = sql.indexOf('*/', i + 2);
        const end = close === -1 ? sql.length : close + 2;
        buf += sql.slice(i, end);
        i = end;
        continue;
      }
      const dollar = rest.match(/^\$([A-Za-z_]\w*)?\$/);
      if (dollar) {
        dollarTag = dollar[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    } else if (dollarTag && rest.startsWith(dollarTag)) {
      buf += dollarTag;
      i += dollarTag.length;
      dollarTag = null;
      continue;
    }

    const ch = sql[i];

    if (!dollarTag && ch === "'") {
      // '' inside a string is an escaped quote, not a terminator.
      if (inSingle && sql[i + 1] === "'") { buf += "''"; i += 2; continue; }
      inSingle = !inSingle;
      buf += ch; i += 1; continue;
    }

    if (ch === ';' && !inSingle && !dollarTag) {
      if (buf.trim()) out.push(buf.trim());
      buf = ''; i += 1; continue;
    }

    buf += ch; i += 1;
  }

  if (buf.trim()) out.push(buf.trim());
  // Drop fragments that are only comments.
  return out.filter((s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim());
}

// --- Run --------------------------------------------------------------------

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) {
  console.error('No .sql files found. Run `npm run schema:sql` first.');
  process.exit(1);
}

console.log(`\n${c.violet}${c.bold}Applying ${files.length} files${DRY ? ' (dry run)' : ''}${c.reset}\n`);

const { PrismaClient } = await import('@prisma/client');
const prisma = DRY ? null : new PrismaClient({ log: [] });

let totalStatements = 0;
let failed = false;

for (const file of files) {
  const statements = splitStatements(readFileSync(path.join(DIR, file), 'utf8'));
  totalStatements += statements.length;

  if (DRY) {
    console.log(`  ${c.dim}·${c.reset} ${file.padEnd(30)} ${statements.length} statements`);
    continue;
  }

  process.stdout.write(`  ${file.padEnd(30)} `);
  try {
    for (const stmt of statements) await prisma.$executeRawUnsafe(stmt);
    console.log(`${c.green}✓${c.reset} ${c.dim}${statements.length} statements${c.reset}`);
  } catch (error) {
    console.log(`${c.red}✗${c.reset}`);
    console.error(`\n${c.red}${String(error.message).split('\n').slice(0, 6).join('\n')}${c.reset}\n`);
    failed = true;
    break;
  }
}

if (prisma) await prisma.$disconnect();

console.log(
  failed
    ? `\n${c.red}${c.bold}Failed.${c.reset} Fix the statement above and re-run — earlier files are idempotent.\n`
    : `\n${c.green}${c.bold}${DRY ? 'Parsed' : 'Applied'} ${totalStatements} statements across ${files.length} files.${c.reset}\n`,
);

process.exit(failed ? 1 : 0);
