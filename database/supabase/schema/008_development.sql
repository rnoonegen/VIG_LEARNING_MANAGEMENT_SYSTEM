-- ============================================================================
-- 008 — Development — evidence over time
--
-- Development is evidence, not a score. A stage change is human judgement, never automatic (BR-10).
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- development_areas
CREATE TABLE IF NOT EXISTS "development_areas" (
    "id" UUID NOT NULL,
    "category" "DevCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CurriculumStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "development_areas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "development_areas_category_name_key" ON "development_areas"("category", "name");

-- student_development_areas
CREATE TABLE IF NOT EXISTS "student_development_areas" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "current_stage" "DevStage" NOT NULL DEFAULT 'EMERGING',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_development_areas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_development_areas_student_id_area_id_key" ON "student_development_areas"("student_id", "area_id");

-- development_observations
CREATE TABLE IF NOT EXISTS "development_observations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "observation" TEXT NOT NULL,
    "observed_on" DATE NOT NULL,
    "observer_id" UUID NOT NULL,
    "class_record_id" UUID,
    "source" "UpdateSource" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "development_observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "development_observations_student_id_observed_on_idx" ON "development_observations"("student_id", "observed_on");
CREATE INDEX IF NOT EXISTS "development_observations_class_record_id_idx" ON "development_observations"("class_record_id");

-- development_stage_changes
CREATE TABLE IF NOT EXISTS "development_stage_changes" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "from_stage" "DevStage" NOT NULL,
    "to_stage" "DevStage" NOT NULL,
    "changed_by" UUID NOT NULL,
    "observation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "development_stage_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "development_stage_changes_student_id_area_id_idx" ON "development_stage_changes"("student_id", "area_id");
