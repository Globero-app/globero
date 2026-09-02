
-- ai_usage_log, error_log, notification_log, sync_log: server-side (service_role) writes only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_usage_log','error_log','notification_log','sync_log'] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated, anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "deny inserts %1$I" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "deny updates %1$I" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "deny deletes %1$I" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "deny inserts %1$I" ON public.%1$I AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "deny updates %1$I" ON public.%1$I AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "deny deletes %1$I" ON public.%1$I AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false)', t);
  END LOOP;
END $$;
