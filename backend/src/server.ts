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
