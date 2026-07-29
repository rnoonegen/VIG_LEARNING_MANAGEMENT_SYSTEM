-- ============================================================================
-- 007 — Class record
--
-- The Overall Class Note is always preserved, even when every optional update is skipped (BR-02). is_ai_generated exists from day one and stays false until Phase 2.
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- class_records
CREATE TABLE IF NOT EXISTS "class_records" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "overall_class_note" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT,
    "audio_path" TEXT,
    "language_detected" TEXT,
    "ai_model" TEXT,
    "ai_cost_micros" INTEGER,
    "status" "ClassRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saved_at" TIMESTAMPTZ(6),

    CONSTRAINT "class_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "class_records_occurrence_id_key" ON "class_records"("occurrence_id");

-- student_observations
CREATE TABLE IF NOT EXISTS "student_observations" (
    "id" UUID NOT NULL,
    "class_record_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "observation" TEXT NOT NULL,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "was_edited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "student_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_observations_class_record_id_student_id_key" ON "student_observations"("class_record_id", "student_id");
