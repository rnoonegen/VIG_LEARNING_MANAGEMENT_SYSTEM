-- ============================================================================
-- 004 — Teaching capability and availability
--
-- Availability is a constraint, not a booking (BR-05). Dated exceptions override the recurring weekly rule on their date (BR-06).
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- teacher_capabilities
CREATE TABLE IF NOT EXISTS "teacher_capabilities" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "min_level_order" INTEGER NOT NULL,
    "max_level_order" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "teacher_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "teacher_capabilities_teacher_id_subject_id_key" ON "teacher_capabilities"("teacher_id", "subject_id");

-- teacher_availability
CREATE TABLE IF NOT EXISTS "teacher_availability" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

    CONSTRAINT "teacher_availability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "teacher_availability_teacher_id_weekday_idx" ON "teacher_availability"("teacher_id", "weekday");

-- teacher_availability_exceptions
CREATE TABLE IF NOT EXISTS "teacher_availability_exceptions" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "is_available" BOOLEAN NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT true,
    "start_time" TEXT,
    "end_time" TEXT,
    "reason" TEXT,

    CONSTRAINT "teacher_availability_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "teacher_availability_exceptions_teacher_id_date_idx" ON "teacher_availability_exceptions"("teacher_id", "date");

-- student_availability
CREATE TABLE IF NOT EXISTS "student_availability" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

    CONSTRAINT "student_availability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_availability_student_id_weekday_idx" ON "student_availability"("student_id", "weekday");
