-- ============================================================================
-- 006 — Scheduling and attendance
--
-- class_occurrences snapshots teacher_id so a later reassignment cannot rewrite history (BR-12). The occurrence is the anchor for everything a class produces (BR-01).
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- classes
CREATE TABLE IF NOT EXISTS "classes" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "days_of_week" INTEGER[],
    "start_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" "CurriculumStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "classes_teacher_id_idx" ON "classes"("teacher_id");

-- class_students
CREATE TABLE IF NOT EXISTS "class_students" (
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,

    CONSTRAINT "class_students_pkey" PRIMARY KEY ("class_id","student_id")
);

-- class_occurrences
CREATE TABLE IF NOT EXISTS "class_occurrences" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "scheduled_start" TIMESTAMPTZ(6) NOT NULL,
    "scheduled_end" TIMESTAMPTZ(6) NOT NULL,
    "teacher_id" UUID NOT NULL,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelled_reason" TEXT,

    CONSTRAINT "class_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "class_occurrences_scheduled_start_idx" ON "class_occurrences"("scheduled_start");
CREATE INDEX IF NOT EXISTS "class_occurrences_teacher_id_scheduled_start_idx" ON "class_occurrences"("teacher_id", "scheduled_start");
CREATE UNIQUE INDEX IF NOT EXISTS "class_occurrences_class_id_scheduled_start_key" ON "class_occurrences"("class_id", "scheduled_start");

-- attendance
CREATE TABLE IF NOT EXISTS "attendance" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_occurrence_id_student_id_key" ON "attendance"("occurrence_id", "student_id");

-- scheduling_requests
CREATE TABLE IF NOT EXISTS "scheduling_requests" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "raw_text" TEXT NOT NULL,
    "interpreted" JSONB,
    "status" TEXT NOT NULL DEFAULT 'INTERPRETED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduling_requests_pkey" PRIMARY KEY ("id")
);

-- schedule_change_proposals
CREATE TABLE IF NOT EXISTS "schedule_change_proposals" (
    "id" UUID NOT NULL,
    "request_id" UUID,
    "moves" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "applied_at" TIMESTAMPTZ(6),
    "applied_by" UUID,

    CONSTRAINT "schedule_change_proposals_pkey" PRIMARY KEY ("id")
);
