-- ============================================================================
-- 012 — Row Level Security: deny all
--
-- AD-01: "RLS stays enabled with deny-all on every table as defence-in-depth;
-- the Supabase data API is disabled. Authorization lives in the service layer
-- where the business rules already are."
--
-- Read that carefully — it is NOT a mistake that there are no policies here.
-- This application never reaches Postgres through PostgREST. Express is the
-- only writer (AD-01), and it connects as the table owner, which bypasses RLS.
-- So enabling RLS with zero policies costs the app nothing and closes the
-- anon/authenticated path completely.
--
-- Without this, student records are protected only by the absence of GRANTs to
-- the anon role — one dashboard toggle or one stray GRANT away from exposure.
-- Prisma migrations never emit RLS statements, which is why this file exists.
--
-- If you ever DO want a table readable by the browser, add an explicit policy
-- in a new numbered file and say why in its header. Never weaken this one.
--
-- Hand-maintained. Safe to re-run.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      -- Prisma owns its bookkeeping table; leave it alone.
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE makes RLS apply to the table owner too, so a future service that
    -- connects as owner cannot quietly read everything.
    -- Left off deliberately: Express IS that owner and is the intended path.
    -- EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

    -- Belt and braces: revoke the API roles outright. RLS alone would already
    -- deny them, but a table with no grants never reaches PostgREST's schema
    -- cache in the first place.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Stop future tables from being granted to the API roles by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Verification — every row should read rls_enabled = true.
--
--   SELECT c.relname, c.relrowsecurity AS rls_enabled
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r'
--   ORDER BY c.relname;
