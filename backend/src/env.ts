import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

// Env lives at the project root so the Prisma CLI, the backend and the frontend
// all read one file. From backend/src that is two levels up.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — copy .env.example to .env'),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('moments'),
  AUTH_EMAIL_DOMAIN: z.string().default('users.valmiki.internal'),

  SCHOOL_TIMEZONE: z.string().default('Asia/Kolkata'),
  FEATURE_WEB_PUSH: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // VAPID keypair for web push (D3). Subscriptions are collected without it;
  // only delivery needs the keys, so both stay optional.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@valmiki.internal'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;

/**
 * Supabase backs Auth and Storage. Both are optional at boot so the API still
 * starts for schema work before credentials land; the guards elsewhere turn a
 * missing key into a clear 503 at the point of use rather than a crash on startup.
 *
 * The placeholders copied from .env.example are treated as absent — otherwise
 * /health would cheerfully report "configured" for a project that does not exist.
 */
const isPlaceholder = (value: string | undefined): boolean =>
  !value || value === 'REPLACE_ME' || value.includes('YOUR_PROJECT_REF');

export const supabaseConfigured = ![
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  env.SUPABASE_SERVICE_ROLE_KEY,
].some(isPlaceholder);
