-- ============================================================================
-- 014 — Reference data
--
-- The minimum a fresh school needs before anyone can log in and start work:
-- the school settings singleton and the development-area catalogue.
--
-- This is NOT demo data. No accounts, students, classes or records are created
-- here — those come from `npm run db:seed` (which also needs Supabase Auth, so
-- it cannot be expressed as SQL). Running this file leaves you with an empty
-- but usable school.
--
-- Development areas are seeded from the boards and remain admin-editable
-- (Q11), so this only inserts what is missing and never overwrites a rename.
--
-- Hand-maintained. Safe to re-run.
-- ============================================================================

-- School settings is a singleton keyed on id = 1.
-- Timezone matters: every date with a scheduling consequence is rendered in it
-- (BR-20). Asia/Kolkata has no DST, which is why UTC arithmetic is safe.
INSERT INTO "school_settings" (
  "id", "name", "timezone", "weekStartDay",
  "weeklyUpdateDay", "weeklyUpdateTime", "aiMonthlyBudgetCents", "updatedAt"
)
VALUES (1, 'Valmiki International Gurukulam', 'Asia/Kolkata', 1, 5, '18:00', 3000, NOW())
ON CONFLICT ("id") DO NOTHING;

-- Development areas, grouped under Personality / Emotional / Physical.
-- ON CONFLICT DO NOTHING so an admin's rename or description edit survives a
-- re-run — the unique key is (category, name).
INSERT INTO "development_areas" ("id", "category", "name", "description", "display_order", "status")
VALUES
  (gen_random_uuid(), 'PERSONALITY', 'Confidence',      'Willingness to attempt, present and stand behind their own thinking.', 0, 'ACTIVE'),
  (gen_random_uuid(), 'PERSONALITY', 'Independence',    'Starting and sustaining work without prompting.',                      1, 'ACTIVE'),
  (gen_random_uuid(), 'PERSONALITY', 'Curiosity',       'Asking questions and exploring beyond what was set.',                  2, 'ACTIVE'),
  (gen_random_uuid(), 'EMOTIONAL',   'Self-regulation', 'Managing frustration and staying with difficult tasks.',               3, 'ACTIVE'),
  (gen_random_uuid(), 'EMOTIONAL',   'Resilience',      'Recovering from mistakes and trying again.',                           4, 'ACTIVE'),
  (gen_random_uuid(), 'EMOTIONAL',   'Communication',   'Expressing ideas and needs clearly to adults and peers.',              5, 'ACTIVE'),
  (gen_random_uuid(), 'PHYSICAL',    'Collaboration',   'Working alongside others during group and practical activities.',      6, 'ACTIVE')
ON CONFLICT ("category", "name") DO NOTHING;

-- Verification.
--
--   SELECT count(*) FROM "school_settings";     -- 1
--   SELECT category, count(*) FROM "development_areas" GROUP BY category;
