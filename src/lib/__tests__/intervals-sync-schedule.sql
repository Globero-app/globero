-- Every case must pass: inclusive Madrid boundaries, summer and winter.
WITH cases(label, instant, expected) AS (VALUES
  ('summer before opening', '2026-10-17T04:15:00Z'::timestamptz, false),
  ('summer opening 06:30', '2026-10-17T04:30:00Z'::timestamptz, true),
  ('summer closing 23:30', '2026-10-17T21:30:00Z'::timestamptz, true),
  ('summer after closing', '2026-10-17T21:45:00Z'::timestamptz, false),
  ('winter before opening', '2026-12-17T05:15:00Z'::timestamptz, false),
  ('winter opening 06:30', '2026-12-17T05:30:00Z'::timestamptz, true),
  ('winter closing 23:30', '2026-12-17T22:30:00Z'::timestamptz, true),
  ('winter after closing', '2026-12-17T22:45:00Z'::timestamptz, false),
  ('Madrid midnight', '2026-10-17T22:00:00Z'::timestamptz, false)
)
SELECT label, public.intervals_sync_window(instant) = expected AS passed FROM cases;