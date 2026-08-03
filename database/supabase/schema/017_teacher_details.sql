-- ============================================================================
-- 017 — Teacher personal details
--
-- A teacher is added the same way a parent or a student is: two name fields, a
-- date of birth, an address and a photo. The name is split because the
-- school-issued sign-in name is built from it (T26PriSha) rather than parsed
-- back out of full_name.
--
-- The photo itself stays on users.avatar_path, which every role already uses.
--
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "first_name" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "last_name" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "date_of_birth" DATE;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "address" TEXT;
