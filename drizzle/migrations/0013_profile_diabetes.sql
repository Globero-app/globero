ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_diabetes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS diabetes_type text,
  ADD COLUMN IF NOT EXISTS cgm_device text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_diabetes_type_chk CHECK (diabetes_type IS NULL OR diabetes_type IN ('type1','type2','lada','mody','other'));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_cgm_device_chk CHECK (cgm_device IS NULL OR cgm_device IN ('none','libre','dexcom','medtronic','eversense','other'));