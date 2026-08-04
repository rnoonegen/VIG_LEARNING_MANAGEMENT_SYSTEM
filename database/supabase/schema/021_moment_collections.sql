-- ============================================================================
-- 021 — Moments, as a collection with one entry per child
--
-- The moments in 009 are a flat gallery: one media object tagged to several
-- students. That shape is still used by class records and weekly updates, so it
-- stays exactly as it is.
--
-- This file adds the shape the school actually works in. An admin or a teacher
-- opens a *moment* — a heading, a description, a date range and the subject it
-- belongs to — and then fills it in one child at a time: a photo, a video link,
-- a title, a description and any reference links worth keeping.
--
--   moment_collections  the moment itself (heading, dates, subject)
--     └── moment_entries      one per child, and only one (the unique index)
--           └── moment_entry_links   reference links on that entry
--
-- The unique index on (collection_id, student_id) is the rule "once a student is
-- in this moment they cannot be added again" — held in the database rather than
-- only in the form, because the form is not the only way a row can arrive.
--
-- Who sees what is decided in the service layer, not here: an admin sees every
-- moment, a teacher the ones they created, a parent the entries belonging to
-- their own children.
--
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- moment_collections
CREATE TABLE IF NOT EXISTS "moment_collections" (
    "id" UUID NOT NULL,
    "heading" TEXT NOT NULL,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_collections_pkey" PRIMARY KEY ("id")
);

-- A teacher's list is "mine, newest first"; the admin's is the same list without
-- the first half of the predicate.
CREATE INDEX IF NOT EXISTS "moment_collections_created_by_start_date_idx"
    ON "moment_collections"("created_by", "start_date" DESC);

CREATE INDEX IF NOT EXISTS "moment_collections_subject_id_idx"
    ON "moment_collections"("subject_id");

CREATE INDEX IF NOT EXISTS "moment_collections_start_date_idx"
    ON "moment_collections"("start_date" DESC);

-- moment_entries
CREATE TABLE IF NOT EXISTS "moment_entries" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    -- Private bucket path, not a URL. Reads are signed per request (AD-04).
    "photo_path" TEXT,
    -- A link to video hosted elsewhere, so a long recording never travels
    -- through our storage or our API.
    "video_url" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_entries_pkey" PRIMARY KEY ("id")
);

-- One child appears at most once in a moment. This is the constraint the UI
-- describes by greying a name out; here is where it is actually true.
CREATE UNIQUE INDEX IF NOT EXISTS "moment_entries_collection_id_student_id_key"
    ON "moment_entries"("collection_id", "student_id");

-- A parent's view starts from the child, so the reverse direction is indexed too.
CREATE INDEX IF NOT EXISTS "moment_entries_student_id_idx"
    ON "moment_entries"("student_id");

-- moment_entry_links
CREATE TABLE IF NOT EXISTS "moment_entry_links" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "moment_entry_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "moment_entry_links_entry_id_display_order_idx"
    ON "moment_entry_links"("entry_id", "display_order");

-- Foreign keys, each dropped before it is added so the file replays cleanly
-- (the convention 011 uses for all of them).
ALTER TABLE "moment_collections"
    DROP CONSTRAINT IF EXISTS "moment_collections_subject_id_fkey";
ALTER TABLE "moment_collections"
    ADD CONSTRAINT "moment_collections_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moment_collections"
    DROP CONSTRAINT IF EXISTS "moment_collections_created_by_fkey";
ALTER TABLE "moment_collections"
    ADD CONSTRAINT "moment_collections_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moment_entries"
    DROP CONSTRAINT IF EXISTS "moment_entries_collection_id_fkey";
ALTER TABLE "moment_entries"
    ADD CONSTRAINT "moment_entries_collection_id_fkey"
    FOREIGN KEY ("collection_id") REFERENCES "moment_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moment_entries"
    DROP CONSTRAINT IF EXISTS "moment_entries_student_id_fkey";
ALTER TABLE "moment_entries"
    ADD CONSTRAINT "moment_entries_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moment_entries"
    DROP CONSTRAINT IF EXISTS "moment_entries_created_by_fkey";
ALTER TABLE "moment_entries"
    ADD CONSTRAINT "moment_entries_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moment_entry_links"
    DROP CONSTRAINT IF EXISTS "moment_entry_links_entry_id_fkey";
ALTER TABLE "moment_entry_links"
    ADD CONSTRAINT "moment_entry_links_entry_id_fkey"
    FOREIGN KEY ("entry_id") REFERENCES "moment_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS deny-all with no policies, matching 012 — Express is the only writer and
-- connects as the table owner, which bypasses RLS (AD-01).
ALTER TABLE "moment_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moment_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moment_entry_links" ENABLE ROW LEVEL SECURITY;
