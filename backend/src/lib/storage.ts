import { randomUUID } from 'node:crypto';
import { env } from '../env.js';
import { supabaseAdmin } from './supabase.js';
import { AppError } from './errors.js';

/**
 * Media never proxies through the API (AD-04). The client asks for a signed
 * upload URL, PUTs the bytes straight to a private bucket, then confirms back so
 * we write only the metadata row. Reads are short-lived signed URLs issued after
 * the caller's access to that student has been verified.
 */
export interface IStorageProvider {
  createUploadUrl(fileName: string, mimeType: string): Promise<{ path: string; uploadUrl: string; token: string }>;
  createSignedReadUrl(path: string, expiresInSeconds?: number): Promise<string>;
  remove(path: string): Promise<void>;
}

const SIGNED_READ_TTL_SECONDS = 60 * 60; // one hour

class SupabaseStorageProvider implements IStorageProvider {
  private readonly bucket = env.SUPABASE_STORAGE_BUCKET;

  async createUploadUrl(fileName: string): Promise<{ path: string; uploadUrl: string; token: string }> {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${new Date().getUTCFullYear()}/${randomUUID()}-${safeName}`;

    const { data, error } = await supabaseAdmin().storage.from(this.bucket).createSignedUploadUrl(path);

    if (error || !data) {
      throw new AppError(502, 'STORAGE_ERROR', `Could not prepare the upload: ${error?.message ?? 'unknown'}`);
    }
    return { path: data.path, uploadUrl: data.signedUrl, token: data.token };
  }

  async createSignedReadUrl(path: string, expiresInSeconds = SIGNED_READ_TTL_SECONDS): Promise<string> {
    const { data, error } = await supabaseAdmin()
      .storage.from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data) {
      throw new AppError(502, 'STORAGE_ERROR', `Could not read that media: ${error?.message ?? 'unknown'}`);
    }
    return data.signedUrl;
  }

  async remove(path: string): Promise<void> {
    await supabaseAdmin().storage.from(this.bucket).remove([path]);
  }
}

export const storage: IStorageProvider = new SupabaseStorageProvider();

/**
 * Batch helper for gallery responses — signs many paths concurrently and drops
 * any that fail rather than failing the whole page.
 */
export async function signMany(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    paths.map(async (p) => {
      try {
        out.set(p, await storage.createSignedReadUrl(p));
      } catch {
        // A single unreadable object should not blank the gallery.
      }
    }),
  );
  return out;
}
