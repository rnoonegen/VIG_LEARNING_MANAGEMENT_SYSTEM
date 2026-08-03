-- ============================================================================
-- 016 — First/last names, school-issued account names and parent contact
--
-- Accounts are issued by the school in a fixed shape (P26NagVen / S26AarSha),
-- built from three characters of each name — so first and last names are stored
-- as separate fields rather than parsed back out of full_name.
--
-- users.username keeps its case for display; the added functional index makes
-- the uniqueness guarantee case-insensitive, which is how sign-in compares it.
--
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- students: split name, plus the roll name (children do not sign in)
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "first_name" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "last_name" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "username" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "students_username_key" ON "students"("username");

-- parents: split name and the contact number the school actually uses
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "first_name" TEXT;
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "last_name" TEXT;
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "mobile_number" TEXT;

-- Sign-in matches without regard to case, so uniqueness must too: without this,
-- "P26NagVen" and "p26nagven" would be two accounts that log in as one.
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_lower_key" ON "users"(lower("username"));
