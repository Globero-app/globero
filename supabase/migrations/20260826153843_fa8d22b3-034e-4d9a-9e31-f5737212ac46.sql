UPDATE public.profiles SET nutrition_goal = 'rendimiento' WHERE nutrition_goal IS NULL OR nutrition_goal = '';
UPDATE public.profiles SET dietary_preferences = NULLIF(TRIM(dietary_preferences), '');
DROP TABLE IF EXISTS public.health_entries;