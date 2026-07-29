-- ============================================================================
-- 009 — Moments — media with educational context
--
-- One Moment is one media object with many student links. The media is never duplicated per student (BR-11).
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- moments
CREATE TABLE IF NOT EXISTS "moments" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "subject_id" UUID,
    "class_occurrence_id" UUID,
    "captured_on" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "source" "MomentSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "moments_captured_on_idx" ON "moments"("captured_on");

-- moment_media
CREATE TABLE IF NOT EXISTS "moment_media" (
    "id" UUID NOT NULL,
    "moment_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "mime_type" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "size_bytes" INTEGER,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "moment_media_pkey" PRIMARY KEY ("id")
);

-- moment_students
CREATE TABLE IF NOT EXISTS "moment_students" (
    "moment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,

    CONSTRAINT "moment_students_pkey" PRIMARY KEY ("moment_id","student_id")
);
