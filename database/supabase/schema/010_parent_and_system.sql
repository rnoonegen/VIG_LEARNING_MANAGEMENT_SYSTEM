-- ============================================================================
-- 010 — Parent-facing and system tables
--
-- Parents see approved outcomes only (BR-13). Notification volume is capped by role (BR-14). ai_usage_log ships now and stays empty until Phase 2 (D4).
--
-- GENERATED from database/schema.prisma via: npm run schema:sql
-- Do not edit by hand: change the Prisma schema, migrate, then regenerate.
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

-- weekly_updates
CREATE TABLE IF NOT EXISTS "weekly_updates" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "summary_text" TEXT NOT NULL DEFAULT '',
    "teacher_note" TEXT,
    "status" "WeeklyUpdateStatus" NOT NULL DEFAULT 'DRAFT',
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "weekly_updates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_updates_student_id_week_start_key" ON "weekly_updates"("student_id", "week_start");

-- weekly_update_items
CREATE TABLE IF NOT EXISTS "weekly_update_items" (
    "id" UUID NOT NULL,
    "weekly_update_id" UUID NOT NULL,
    "item_type" "WeeklyUpdateItemType" NOT NULL,
    "ref_id" UUID,
    "highlight_text" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "weekly_update_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "weekly_update_items_weekly_update_id_display_order_idx" ON "weekly_update_items"("weekly_update_id", "display_order");

-- notifications
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_recipient_user_id_created_at_idx" ON "notifications"("recipient_user_id", "created_at");

-- ai_usage_log
CREATE TABLE IF NOT EXISTS "ai_usage_log" (
    "id" UUID NOT NULL,
    "workflow" "AiWorkflow" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "audio_seconds" INTEGER,
    "cost_micros" INTEGER NOT NULL DEFAULT 0,
    "occurrence_id" UUID,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id")
);

-- audit_log
CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");
