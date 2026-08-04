-- ============================================================================
-- 019 — Curriculum names are unique within their parent
--
-- Nothing stopped the same heading being added to a level twice, or the same
-- sub-heading to a heading. Subjects had a unique index, but a case-sensitive
-- one: "Mathematics" and "mathematics" were two subjects, and a teacher then
-- had to guess which of them their students were being ticked off against.
--
-- Uniqueness is per parent and case-insensitive: one subject name across the
-- school, one level name per subject, one heading per level, one sub-heading
-- per heading.
--
-- The indexes are partial — ARCHIVED rows are excluded. Removing is archiving
-- here (BR-17), so a heading a child was once ticked against stays queryable;
-- it should not also keep its name reserved forever.
--
-- The API refuses duplicates first and with a readable message (curriculum
-- service). These indexes are the backstop for anything that reaches Postgres
-- another way — the seed, a script, two admins typing at once.
--
-- Hand-maintained. Safe to re-run.
-- ============================================================================

-- --- Existing duplicates ----------------------------------------------------
--
-- A unique index cannot be created over rows that already violate it, and this
-- folder has to apply cleanly to a database that has been in use. Duplicates
-- are renamed rather than archived — "Fractions (2)" is visible and fixable,
-- whereas an archived row silently disappears from the admin's screen.
--
-- The oldest row in each group keeps the name; ties break on id so a re-run
-- picks the same winner. The loop handles a rename that collides with an
-- existing "(2)", and is capped so it can never spin.

DO $$
DECLARE
  spec RECORD;
  renamed INTEGER;
  passes INTEGER;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('subjects', 'lower(name)'),
      ('levels',   'subject_id, lower(name)'),
      ('topics',   'level_id, lower(name)'),
      ('skills',   'topic_id, lower(name)')
    ) AS t(tbl, scope)
  LOOP
    passes := 0;
    LOOP
      EXECUTE format(
        'UPDATE %1$I x SET name = x.name || '' ('' || d.rn || '')'' '
        'FROM (SELECT id, row_number() OVER (PARTITION BY %2$s ORDER BY display_order, id) AS rn '
        '      FROM %1$I WHERE status <> ''ARCHIVED'') d '
        'WHERE x.id = d.id AND d.rn > 1',
        spec.tbl, spec.scope
      );
      GET DIAGNOSTICS renamed = ROW_COUNT;

      IF renamed > 0 THEN
        RAISE NOTICE '019: renamed % duplicate row(s) in %', renamed, spec.tbl;
      END IF;

      passes := passes + 1;
      EXIT WHEN renamed = 0 OR passes >= 10;
    END LOOP;
  END LOOP;
END $$;

-- --- The indexes ------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "subjects_name_lower_key"
  ON "subjects" (lower("name")) WHERE "status" <> 'ARCHIVED';

CREATE UNIQUE INDEX IF NOT EXISTS "levels_subject_id_name_lower_key"
  ON "levels" ("subject_id", lower("name")) WHERE "status" <> 'ARCHIVED';

CREATE UNIQUE INDEX IF NOT EXISTS "topics_level_id_name_lower_key"
  ON "topics" ("level_id", lower("name")) WHERE "status" <> 'ARCHIVED';

CREATE UNIQUE INDEX IF NOT EXISTS "skills_topic_id_name_lower_key"
  ON "skills" ("topic_id", lower("name")) WHERE "status" <> 'ARCHIVED';

-- `subjects_name_key` (003) and `levels_subject_id_name_key` (003) are left in
-- place. They are exact-match and cover archived rows, so an archived subject
-- still holds its exact name; the service says so in as many words rather than
-- returning a bare conflict. Prisma's schema keeps `@unique` on Subject.name
-- because the seed upserts subjects by name.

-- Verification —
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename IN ('subjects','levels','topics','skills')
--     AND indexname LIKE '%name_lower_key';
--
--   -- should return no rows:
--   SELECT level_id, lower(name), count(*) FROM topics WHERE status <> 'ARCHIVED'
--   GROUP BY 1, 2 HAVING count(*) > 1;
