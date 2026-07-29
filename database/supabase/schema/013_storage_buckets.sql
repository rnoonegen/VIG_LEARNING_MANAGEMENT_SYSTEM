-- ============================================================================
-- 013 — Storage buckets
--
-- AD-04: media never proxies through the API. The client asks Express for a
-- signed upload URL (after an authz check), uploads straight to Supabase
-- Storage, then confirms so Express can write the metadata row. Reads are
-- short-lived signed URLs, issued only after verifying the caller may see that
-- student.
--
-- The bucket is PRIVATE. That is the whole security model here: a photograph of
-- a child must never be reachable by guessing a URL. Every read goes through a
-- signed URL minted by the API, and every signature is preceded by a permission
-- check (BR-13 for parents, class ownership for teachers).
--
-- No storage.objects policies are defined, for the same reason as 012: the
-- service_role key used by Express bypasses them, and nothing else should ever
-- touch this bucket directly.
--
-- Hand-maintained. Safe to re-run.
-- ============================================================================

-- 'moments' matches SUPABASE_STORAGE_BUCKET in .env — change both together.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moments',
  'moments',
  false,                       -- private; signed URLs only
  52428800,                    -- 50 MB — comfortably covers a phone photo or a short clip
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Avatars for users and students. Also private: a school roster photograph is
-- no more public than a class photo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880,                     -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Verification — both rows should show public = false.
--
--   SELECT id, public, file_size_limit FROM storage.buckets;
