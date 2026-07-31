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
  createUploadUrl(
    fileName: string,
    mimeType: string,
    prefix?: string,
  ): Promise<{ path: string; uploadUrl: string; token: string }>;
  createSignedReadUrl(path: string, expiresInSeconds?: number): Promise<string>;
  remove(path: string): Promise<void>;
}

const SIGNED_READ_TTL_SECONDS = 60 * 60; // one hour

class SupabaseStorageProvider implements IStorageProvider {
  constructor(private readonly bucket: string) {}

  async createUploadUrl(
    fileName: string,
    _mimeType?: string,
    prefix?: string,
  ): Promise<{ path: string; uploadUrl: string; token: string }> {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const folder = prefix ? `${prefix}/` : '';
    const path = `${folder}${new Date().getUTCFullYear()}/${randomUUID()}-${safeName}`;

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

/** Class media: photos and video from Moments and class records. */
export const storage: IStorageProvider = new SupabaseStorageProvider(env.SUPABASE_STORAGE_BUCKET);

/** Profile photographs for users and students. Private, like everything else. */
export const avatarStorage: IStorageProvider = new SupabaseStorageProvider(env.SUPABASE_AVATAR_BUCKET);

/**
 * Batch helper for gallery responses — signs many paths concurrently and drops
 * any that fail rather than failing the whole page.
 */
export async function signMany(
  paths: string[],
  provider: IStorageProvider = storage,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    paths.map(async (p) => {
      try {
        out.set(p, await provider.createSignedReadUrl(p));
      } catch {
        // A single unreadable object should not blank the gallery.
      }
    }),
  );
  return out;
}

/** One avatar path → a signed URL, or null. Never fails a page over a photo. */
export async function signAvatar(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    return await avatarStorage.createSignedReadUrl(path);
  } catch {
    return null;
  }
}
