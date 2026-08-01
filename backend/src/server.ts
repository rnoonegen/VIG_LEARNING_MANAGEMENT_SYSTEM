import { createApp } from './app.js';
import { env, supabaseConfigured } from './env.js';
import { prisma } from './prisma.js';
import { extendHorizon } from './modules/scheduling/service.js';
import { sweepMissedRecords } from './modules/classrecord/service.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`[api] Valmiki LMS API listening on http://localhost:${env.PORT}/api/v1`);
  console.log(`[api] environment: ${env.NODE_ENV} · timezone: ${env.SCHOOL_TIMEZONE}`);
  if (!supabaseConfigured) {
    console.warn(
      '[api] Supabase credentials are missing. Sign-in and media will return 503 until\n' +
        '      SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set in .env.',
    );
  }
});

/**
 * A listen failure is a setup problem, not a crash worth a stack trace.
 *
 * The common one by far is starting a second copy while the first is still
 * running — `tsx watch` in another terminal, or a server left behind by a
 * previous session. Node's default is an unhandled 'error' event and forty
 * lines of internals; this says what happened and how to clear it.
 */
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[api] Port ${env.PORT} is already in use — the API is probably already running.\n\n` +
        '      Find and stop it:\n' +
        `        Windows    netstat -ano | findstr :${env.PORT}   then  taskkill /PID <pid> /F\n` +
        `        macOS/Linux  lsof -ti:${env.PORT} | xargs kill\n\n` +
        `      Or start this one somewhere else:  PORT=4001 npm run dev\n`,
    );
  } else {
    console.error(`\n[api] Could not start the server: ${err.message}\n`);
  }
  process.exit(1);
});

/**
 * Occurrences are materialised over a rolling horizon (AD-05). Extending on boot
 * plus once a day keeps the schedule grid populated without a separate worker
 * process, which is the right trade at this scale.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

extendHorizon()
  .then((count) => count && console.log(`[api] materialised ${count} class occurrences`))
  .catch((err) => console.error('[api] could not extend the occurrence horizon:', err));

const horizonTimer = setInterval(() => {
  extendHorizon().catch((err) => console.error('[api] horizon extension failed:', err));
}, DAY_MS);

/**
 * A recording deadline passes at a wall-clock hour, so this runs hourly rather
 * than daily: a once-a-day sweep tied to boot time would report a missed record
 * anywhere up to 24 hours late. The sweep is idempotent — it will not announce
 * the same teacher and day twice.
 */
const sweep = () =>
  sweepMissedRecords()
    .then((count) => count && console.log(`[api] reported ${count} missed class record group(s)`))
    .catch((err) => console.error('[api] missed class-record sweep failed:', err));

void sweep();
const missedRecordTimer = setInterval(() => void sweep(), HOUR_MS);

async function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down`);
  clearInterval(horizonTimer);
  clearInterval(missedRecordTimer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
