-- ============================================================================
-- 024 — An entry can belong to a group, not only to one child
--
-- Until now every entry inside a moment was one child's: `moment_entries` held
-- a single `student_id`, so writing up twelve children who built one model
-- together produced twelve cards carrying the same photograph and the same
-- sentence. The moment read as a duplicate list rather than as the one thing
-- that happened.
--
-- So an entry now names its audience in a table of its own:
--
--   INDIVIDUAL  one row in `moment_entry_students`. Unchanged in every way that
--               matters — still a card per child, still editable and removable
--               on its own.
--   GROUP       one entry, one row per child in it. One card, one photograph,
--               everyone who was there named on it.
--
-- `collection_id` is carried on the join table as well as on the entry, so the
-- rule the form describes by greying a name out — one child, once, per moment —
-- stays a database constraint and holds across both kinds. A child cannot be in
-- a group entry and have an individual one in the same moment.
--
-- Existing rows become individual entries, which is exactly what they were: the
-- backfill copies `student_id` across before the column is dropped, so nothing
-- already written up changes shape or owner.
--
-- Safe to re-run.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "MomentEntryKind" AS ENUM ('INDIVIDUAL', 'GROUP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "moment_entries"
    ADD COLUMN IF NOT EXISTS "kind" "MomentEntryKind" NOT NULL DEFAULT 'INDIVIDUAL';

CREATE TABLE IF NOT EXISTS "moment_entry_students" (
    "entry_id"      UUID NOT NULL,
    "student_id"    UUID NOT NULL,
    -- Denormalised from the entry so the uniqueness below can be stated at all.
    "collection_id" UUID NOT NULL,
    CONSTRAINT "moment_entry_students_pkey" PRIMARY KEY ("entry_id", "student_id")
);

-- Everything written before this migration was one child's, so it becomes an
-- individual entry with exactly one row here. Guarded on the old column still
-- existing, which is what makes the whole file safe to run twice.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'moment_entries' AND column_name = 'student_id'
  ) THEN
    INSERT INTO "moment_entry_students" ("entry_id", "student_id", "collection_id")
    SELECT "id", "student_id", "collection_id" FROM "moment_entries"
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- One child, once, per moment — however the entry naming them was written.
CREATE UNIQUE INDEX IF NOT EXISTS "moment_entry_students_collection_id_student_id_key"
    ON "moment_entry_students" ("collection_id", "student_id");
CREATE INDEX IF NOT EXISTS "moment_entry_students_student_id_idx"
    ON "moment_entry_students" ("student_id");

ALTER TABLE "moment_entry_students"
    DROP CONSTRAINT IF EXISTS "moment_entry_students_entry_id_fkey";
ALTER TABLE "moment_entry_students"
    ADD CONSTRAINT "moment_entry_students_entry_id_fkey"
    FOREIGN KEY ("entry_id") REFERENCES "moment_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moment_entry_students"
    DROP CONSTRAINT IF EXISTS "moment_entry_students_student_id_fkey";
ALTER TABLE "moment_entry_students"
    ADD CONSTRAINT "moment_entry_students_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moment_entry_students"
    DROP CONSTRAINT IF EXISTS "moment_entry_students_collection_id_fkey";
ALTER TABLE "moment_entry_students"
    ADD CONSTRAINT "moment_entry_students_collection_id_fkey"
    FOREIGN KEY ("collection_id") REFERENCES "moment_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The audience now lives in one place. Dropped last, after the backfill above
-- has certainly run.
ALTER TABLE "moment_entries" DROP CONSTRAINT IF EXISTS "moment_entries_student_id_fkey";
DROP INDEX IF EXISTS "moment_entries_collection_id_student_id_key";
DROP INDEX IF EXISTS "moment_entries_student_id_idx";
ALTER TABLE "moment_entries" DROP COLUMN IF EXISTS "student_id";

CREATE INDEX IF NOT EXISTS "moment_entries_collection_id_idx"
    ON "moment_entries" ("collection_id");

-- RLS deny-all with no policies, matching 012 — Express is the only writer and
-- connects as the table owner, which bypasses RLS (AD-01).
ALTER TABLE "moment_entry_students" ENABLE ROW LEVEL SECURITY;
