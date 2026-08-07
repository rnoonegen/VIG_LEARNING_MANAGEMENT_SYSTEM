-- ============================================================================
-- 026 — "Notify me" as an account preference
--
-- One switch per user, held on the account rather than the browser, so an
-- admin, a teacher or a parent who turns notifications off in Settings stays
-- quiet on every device they sign in from — the existing push_subscriptions
-- rows (002) answer a different question: "does *this* browser accept push",
-- not "does this person want to be told".
--
-- Off mutes the alert, it does not cancel the message. Rows are still written
-- to `notifications`, because the ones this product sends are things somebody
-- has to act on — a password reset waiting on an admin, a weekly update ready
-- for a parent. Dropping them at the write path would turn a preference about
-- interruption into silent data loss. What OFF suppresses is push delivery and
-- the unread badge; the notification centre stays complete.
--
-- Defaults to true: an account that has never touched the setting behaves
-- exactly as it did before this column existed.
--
-- BR-14 is untouched. *What* reaches which role is still the product's rule and
-- still enforced in notifications/service.ts; this is only "all of it, or none
-- of it, for now".
--
-- Hand-maintained. Safe to re-run.
-- ============================================================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "notifications_enabled" BOOLEAN NOT NULL DEFAULT TRUE;

-- Verification —
--
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'users' AND column_name = 'notifications_enabled';
