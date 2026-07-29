-- ============================================================================
-- 001 — Enumerated types
--
-- Every enum the schema uses. Mirrored in shared/enums.ts so the browser never loads the Prisma runtime.
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'PARENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CurriculumStatus" AS ENUM ('ACTIVE', 'REVIEW', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SkillStatus" AS ENUM ('TO_LEARN', 'LEARNING', 'NEEDS_SUPPORT', 'MASTERED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DevCategory" AS ENUM ('PERSONALITY', 'EMOTIONAL', 'PHYSICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DevStage" AS ENUM ('EMERGING', 'DEVELOPING', 'CONSISTENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OccurrenceStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClassRecordStatus" AS ENUM ('DRAFT', 'TRANSCRIBING', 'PROCESSING', 'IN_REVIEW', 'SAVED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UpdateSource" AS ENUM ('CLASS_RECORD', 'TEACHER_MANUAL', 'ADMIN_MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MomentSource" AS ENUM ('CLASS_RECORD', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WeeklyUpdateStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WeeklyUpdateItemType" AS ENUM ('LEARNING', 'DEVELOPMENT', 'MOMENT', 'CLASS_NOTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('WEEKLY_UPDATE_READY', 'SCHEDULE_CHANGED', 'CLASS_RECORD_DUE', 'AVAILABILITY_CONFLICT', 'TEACHER_AVAILABILITY_CHANGE', 'STUDENT_AVAILABILITY_CHANGE', 'INCOMPLETE_SETUP', 'PASSWORD_RESET_REQUEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttentionType" AS ENUM ('TEACHER_UNAVAILABLE', 'STUDENT_UNAVAILABLE', 'SCHEDULE_CONFLICT', 'INCOMPLETE_STUDENT_SETUP', 'CLASS_RECORD_OVERDUE', 'SETUP_INCOMPLETE', 'PASSWORD_RESET_REQUEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AiWorkflow" AS ENUM ('VOICE_TRANSCRIPTION', 'VOICE_EXTRACTION', 'SCHEDULE_INTERPRET', 'SCHEDULE_CHANGE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
