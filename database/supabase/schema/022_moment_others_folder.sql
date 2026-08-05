-- ============================================================================
-- 022 — The "Others" folder for moments
--
-- Moments are browsed as folders: one per curriculum subject, plus a single
-- catch-all called "Others" for the things that belong to the school rather than
-- to a subject — a festival, a trip, a visitor, a stray afternoon worth keeping.
--
-- "Others" is deliberately NOT a row in `subjects`. A fake subject would leak
-- into every place the curriculum is real: teacher capabilities, class
-- scheduling, student levels, the curriculum tree. So the folder is represented
-- by the absence of a subject — `subject_id IS NULL` — and the API names it.
--
-- Who may use it is decided in the service layer: only an admin can file a
-- moment under Others, and only an admin sees those moments. A teacher's subject
-- list never offers it, and a parent's list filters it out.
--
-- Safe to re-run — dropping a NOT NULL that is already dropped is a no-op.
-- ============================================================================

ALTER TABLE "moment_collections" ALTER COLUMN "subject_id" DROP NOT NULL;

-- The Others folder is read as its own list, so it gets its own partial index
-- rather than sharing the subject_id index with every real subject.
CREATE INDEX IF NOT EXISTS "moment_collections_others_start_date_idx"
    ON "moment_collections"("start_date" DESC)
    WHERE "subject_id" IS NULL;
