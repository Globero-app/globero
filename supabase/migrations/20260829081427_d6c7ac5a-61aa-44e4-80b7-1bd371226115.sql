CREATE TABLE public.notification_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  attempts smallint NOT NULL DEFAULT 1,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notification log" ON public.notification_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX notification_log_user_created_idx ON public.notification_log (user_id, created_at DESC);

CREATE TABLE public.error_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL,
  message text NOT NULL,
  stack text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.error_log TO authenticated;
GRANT ALL ON public.error_log TO service_role;
ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read error log" ON public.error_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX error_log_created_idx ON public.error_log (created_at DESC);

CREATE TABLE public.sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ok boolean NOT NULL DEFAULT true,
  items integer NOT NULL DEFAULT 0,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sync_log TO authenticated;
GRANT ALL ON public.sync_log TO service_role;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sync log" ON public.sync_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX sync_log_user_created_idx ON public.sync_log (user_id, created_at DESC);