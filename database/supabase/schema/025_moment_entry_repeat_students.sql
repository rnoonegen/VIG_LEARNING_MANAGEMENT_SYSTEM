-- ============================================================================
-- 025 — A child may appear in a moment more than once
--
-- 024 held a child to one entry per moment, on the reading that a moment is one
-- class session and being written up twice for it is a mistake.
--
-- That reading is too narrow. A moment is as wide as its dates: one Independence
-- Day programme is one moment, and the same child dances in a group, gives a
-- speech on their own, and sings in the choir. Three things happened; three
-- entries is the honest record, and the old constraint made two of them
-- impossible to write down.
--
-- So the unique index goes. What remains is the primary key on
-- (entry_id, student_id), which still rules out the only genuinely meaningless
-- case: the same child named twice inside one entry.
--
-- `collection_id` stays on the table — it no longer carries a constraint, but it
-- is what lets the visibility queries ask "is this child in this moment" without
-- joining through the entries. A plain index replaces the unique one so those
-- lookups stay as fast as they were.
--
-- Nothing is rewritten and nothing is lost: dropping a constraint cannot
-- invalidate rows that satisfied it.
--
-- Safe to re-run.
-- ============================================================================

DROP INDEX IF EXISTS "moment_entry_students_collection_id_student_id_key";

CREATE INDEX IF NOT EXISTS "moment_entry_students_collection_id_student_id_idx"
    ON "moment_entry_students" ("collection_id", "student_id");
