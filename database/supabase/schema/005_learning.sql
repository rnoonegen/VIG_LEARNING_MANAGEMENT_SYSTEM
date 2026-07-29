-- ============================================================================
-- 005 — Student learning state
--
-- learning_updates is append-only history; student_skill_progress is its projection, written in the same transaction (BR-09). Level changes preserve history (BR-08).
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- student_subject_levels
CREATE TABLE IF NOT EXISTS "student_subject_levels" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "student_subject_levels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_subject_levels_student_id_is_current_idx" ON "student_subject_levels"("student_id", "is_current");
CREATE UNIQUE INDEX IF NOT EXISTS "student_subject_levels_student_id_subject_id_level_id_key" ON "student_subject_levels"("student_id", "subject_id", "level_id");

-- student_skill_progress
CREATE TABLE IF NOT EXISTS "student_skill_progress" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "status" "SkillStatus" NOT NULL DEFAULT 'TO_LEARN',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_skill_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_skill_progress_student_id_skill_id_key" ON "student_skill_progress"("student_id", "skill_id");

-- learning_updates
CREATE TABLE IF NOT EXISTS "learning_updates" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "previous_status" "SkillStatus",
    "new_status" "SkillStatus" NOT NULL,
    "note" TEXT,
    "evidence_path" TEXT,
    "source" "UpdateSource" NOT NULL,
    "class_record_id" UUID,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "learning_updates_student_id_created_at_idx" ON "learning_updates"("student_id", "created_at");
CREATE INDEX IF NOT EXISTS "learning_updates_class_record_id_idx" ON "learning_updates"("class_record_id");

-- level_completions
CREATE TABLE IF NOT EXISTS "level_completions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "from_level_id" UUID NOT NULL,
    "to_level_id" UUID,
    "carried_forward_skill_ids" UUID[],
    "confirmed_by" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_completions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "level_completions_student_id_subject_id_idx" ON "level_completions"("student_id", "subject_id");
