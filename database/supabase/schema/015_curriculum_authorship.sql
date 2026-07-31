-- ============================================================================
-- 015 — Curriculum authorship
--
-- Headings (topics) and sub-headings (skills) are no longer written only by the
-- administrator: the teacher assigned to a subject fills in their own level's
-- curriculum. Once two people can write to the same list, "who added this, and
-- when" stops being a nicety and becomes the audit trail for the curriculum
-- itself.
--
-- Subjects and levels keep no author on purpose. They are structural — created
-- once by an administrator — and their history is already in the audit log.
--
-- created_by is nullable and ON DELETE SET NULL: a heading outlives the person
-- who typed it. Accounts are deactivated rather than deleted here, so in
-- practice it stays populated.
--
-- Hand-maintained. Safe to re-run.
-- ============================================================================

ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "created_by" UUID;
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "created_by" UUID;
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "topics_created_by_idx" ON "topics"("created_by");
CREATE INDEX IF NOT EXISTS "skills_created_by_idx" ON "skills"("created_by");

-- Foreign keys last, per the convention in this folder's README.
ALTER TABLE "topics" DROP CONSTRAINT IF EXISTS "topics_created_by_fkey";
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "skills" DROP CONSTRAINT IF EXISTS "skills_created_by_fkey";
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Verification —
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('topics','skills') AND column_name LIKE '%_at' OR column_name = 'created_by';
