-- ============================================================================
-- 018 — Teacher leave requests
--
-- A teacher states their own weekly availability, but taking a day out of it is
-- the school's decision. A leave request is that ask; approving one writes the
-- dated exceptions the scheduler already reads, so approved leave is simply
-- unavailability that went through a gate.
--
-- exceptions.leave_request_id ties a generated exception back to the request it
-- came from, so withdrawing an approval takes its exceptions with it and the two
-- can never drift apart. ON DELETE CASCADE does that work.
--
-- Classes already booked on approved dates are deliberately NOT cancelled here.
-- They surface on Admin Home as a scheduling issue for a person to resolve
-- (BR-06) — nothing removes a class from a child's calendar silently.
--
-- Safe to re-run — every statement is idempotent.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The notification catalogue gains the two ends of the conversation: the request
-- reaching every admin, and the answer coming back to the teacher.
--
-- Deliberately NOT inside a DO block — Postgres refuses ALTER TYPE ... ADD VALUE
-- from a function body. IF NOT EXISTS is what makes these re-runnable.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAVE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAVE_DECIDED';

-- teacher_leave_requests
CREATE TABLE IF NOT EXISTS "teacher_leave_requests" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT true,
    "start_time" TEXT,
    "end_time" TEXT,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "teacher_leave_requests_teacher_id_from_date_idx"
    ON "teacher_leave_requests"("teacher_id", "from_date");

CREATE INDEX IF NOT EXISTS "teacher_leave_requests_status_idx"
    ON "teacher_leave_requests"("status");

ALTER TABLE "teacher_availability_exceptions"
    ADD COLUMN IF NOT EXISTS "leave_request_id" UUID;

CREATE INDEX IF NOT EXISTS "teacher_availability_exceptions_leave_request_id_idx"
    ON "teacher_availability_exceptions"("leave_request_id");

-- Foreign keys, each dropped before it is added so the file replays cleanly
-- (the convention 011 uses for all 58 of them).
ALTER TABLE "teacher_leave_requests"
    DROP CONSTRAINT IF EXISTS "teacher_leave_requests_teacher_id_fkey";
ALTER TABLE "teacher_leave_requests"
    ADD CONSTRAINT "teacher_leave_requests_teacher_id_fkey"
    FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_leave_requests"
    DROP CONSTRAINT IF EXISTS "teacher_leave_requests_decided_by_id_fkey";
ALTER TABLE "teacher_leave_requests"
    ADD CONSTRAINT "teacher_leave_requests_decided_by_id_fkey"
    FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teacher_availability_exceptions"
    DROP CONSTRAINT IF EXISTS "teacher_availability_exceptions_leave_request_id_fkey";
ALTER TABLE "teacher_availability_exceptions"
    ADD CONSTRAINT "teacher_availability_exceptions_leave_request_id_fkey"
    FOREIGN KEY ("leave_request_id") REFERENCES "teacher_leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS deny-all with no policies, matching 012 — Express is the only writer and
-- connects as the table owner, which bypasses RLS (AD-01).
ALTER TABLE "teacher_leave_requests" ENABLE ROW LEVEL SECURITY;
