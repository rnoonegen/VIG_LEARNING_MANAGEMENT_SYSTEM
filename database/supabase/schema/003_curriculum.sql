-- ============================================================================
-- 003 — Curriculum — Subject → Level → Topic → Skill
--
-- Curriculum defines what exists; the Learning Map defines where a student is. Skill status belongs to the student, not the curriculum (BR-07).
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- subjects
CREATE TABLE IF NOT EXISTS "subjects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color_token" TEXT NOT NULL DEFAULT 'violet',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CurriculumStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subjects_name_key" ON "subjects"("name");

-- levels
CREATE TABLE IF NOT EXISTS "levels" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CurriculumStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "levels_subject_id_display_order_idx" ON "levels"("subject_id", "display_order");
CREATE UNIQUE INDEX IF NOT EXISTS "levels_subject_id_name_key" ON "levels"("subject_id", "name");

-- topics
CREATE TABLE IF NOT EXISTS "topics" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CurriculumStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "topics_level_id_display_order_idx" ON "topics"("level_id", "display_order");

-- skills
CREATE TABLE IF NOT EXISTS "skills" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "learning_goal" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CurriculumStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "skills_topic_id_display_order_idx" ON "skills"("topic_id", "display_order");
