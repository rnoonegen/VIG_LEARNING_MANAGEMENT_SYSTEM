import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, supabaseConfigured } from '../env.js';
import { serviceUnavailable } from './errors.js';

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

function assertConfigured(): void {
  if (!supabaseConfigured) {
    throw serviceUnavailable(
      'Supabase is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.',
    );
  }
}

/**
 * Service-role client. Creates and updates auth users, and issues signed storage
 * URLs. Never exposed to the browser — it bypasses row-level security.
 */
export function supabaseAdmin(): SupabaseClient {
  assertConfigured();
  adminClient ??= createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/**
 * Anon client, used server-side only to exchange credentials for a session
 * (AD-02). The browser never talks to Supabase directly.
 */
export function supabaseAnon(): SupabaseClient {
  assertConfigured();
  anonClient ??= createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return anonClient;
}

/** School-issued usernames are keyed to Supabase Auth via a non-routable alias. */
export function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@${env.AUTH_EMAIL_DOMAIN}`;
}
