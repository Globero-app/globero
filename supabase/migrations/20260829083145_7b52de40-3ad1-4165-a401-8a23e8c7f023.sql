-- Registro de uso de la IA para medir el gasto por función
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  fn text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.ai_usage_log to authenticated;
grant all on public.ai_usage_log to service_role;

alter table public.ai_usage_log enable row level security;

create policy "Users read own ai usage"
  on public.ai_usage_log for select to authenticated
  using (auth.uid() = user_id);

-- Caché del consejo diario del coach
alter table public.profiles add column if not exists daily_brief_cache jsonb;

-- Índices para las consultas frecuentes de los crons
create index if not exists idx_intervals_activities_user_date on public.intervals_activities (user_id, start_date desc);
create index if not exists idx_workouts_user_status on public.workouts (user_id, status);
create index if not exists idx_ai_usage_log_user_created on public.ai_usage_log (user_id, created_at desc);