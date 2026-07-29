-- ============================================================================
-- 002 — Identity — school, accounts, students
--
-- users.id mirrors the Supabase Auth uid (AD-02). Role and status live here, never in the token, so disabling an account takes effect on the next request (AD-03).
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- school_settings
CREATE TABLE IF NOT EXISTS "school_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Valmiki International Gurukulam',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "weekStartDay" INTEGER NOT NULL DEFAULT 1,
    "weeklyUpdateDay" INTEGER NOT NULL DEFAULT 5,
    "weeklyUpdateTime" TEXT NOT NULL DEFAULT '18:00',
    "aiMonthlyBudgetCents" INTEGER NOT NULL DEFAULT 3000,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("id")
);

-- users
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email_alias" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "full_name" TEXT NOT NULL,
    "avatar_path" TEXT,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_alias_key" ON "users"("email_alias");
CREATE INDEX IF NOT EXISTS "users_role_status_idx" ON "users"("role", "status");

-- push_subscriptions
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- teachers
CREATE TABLE IF NOT EXISTS "teachers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notes" TEXT,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "teachers_user_id_key" ON "teachers"("user_id");

-- parents
CREATE TABLE IF NOT EXISTS "parents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "parents_user_id_key" ON "parents"("user_id");

-- parent_students
CREATE TABLE IF NOT EXISTS "parent_students" (
    "parent_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "relationship" TEXT,

    CONSTRAINT "parent_students_pkey" PRIMARY KEY ("parent_id","student_id")
);

-- students
CREATE TABLE IF NOT EXISTS "students" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "grade_label" TEXT,
    "joined_at" DATE,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatar_path" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "students_status_idx" ON "students"("status");
