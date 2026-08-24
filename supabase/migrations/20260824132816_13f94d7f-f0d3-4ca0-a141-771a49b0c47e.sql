ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS linking_code text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_linking_code_key ON public.profiles (linking_code) WHERE linking_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_chat_id_key ON public.profiles (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;