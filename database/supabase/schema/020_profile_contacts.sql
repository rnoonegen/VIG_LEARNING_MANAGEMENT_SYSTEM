-- ============================================================================
-- 020 — Contact details on a teacher's and a parent's own profile
--
-- Everything the school needs to reach a person, and to reach someone else if
-- that person is unwell: email, mobile, blood group, address and an emergency
-- contact number. Held per person, filled in by them from Settings → Profile,
-- and visible to an administrator on their profile page.
--
-- Symmetric across teachers and parents on purpose — the same five fields, the
-- same names — so one profile form serves both. Each table already had part of
-- the set (teachers.address from 017, parents.mobile_number from 016); this
-- fills in the rest rather than moving what is already there.
--
-- `email` is a contact detail, not a delivery channel. Nothing is sent to it —
-- there is no email in this system (D2), and users.email_alias remains the
-- synthetic Supabase Auth identity, unrelated to this column.
--
-- Names stay out: first_name and last_name key the school-issued sign-in name
-- (T26PriSha), so they are the administrator's to change, not the account
-- holder's.
--
-- Hand-maintained. Safe to re-run.
-- ============================================================================

ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "mobile_number" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "blood_group" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "emergency_contact" TEXT;

ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "blood_group" TEXT;
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "emergency_contact" TEXT;

-- Verification —
--
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_name IN ('teachers','parents')
--     AND column_name IN ('email','mobile_number','blood_group','address','emergency_contact')
--   ORDER BY table_name, column_name;
