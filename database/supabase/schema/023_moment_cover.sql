-- ============================================================================
-- 023 — A moment carries its own cover photograph
--
-- Until now a moment card was covered by a mosaic assembled from the children's
-- own entry photos. That put private, per-child photographs into browse chrome:
-- a folder card showed the faces of everyone inside it to anyone who could see
-- the folder, before they had opened anything.
--
-- So a moment now has one deliberate cover, chosen by whoever opened it. The
-- children's photographs stay where they belong — inside their own entries,
-- behind the access checks that already govern them.
--
-- Like every other image in the system this is a private bucket path, never a
-- URL; reads are signed per request (AD-04).
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE "moment_collections" ADD COLUMN IF NOT EXISTS "cover_path" TEXT;
