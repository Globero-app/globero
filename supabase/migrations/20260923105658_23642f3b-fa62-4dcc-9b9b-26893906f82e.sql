create table if not exists public.cron_auth (
  id integer primary key default 1,
  token text not null,
  created_at timestamptz not null default now()
);
grant all on public.cron_auth to service_role;
alter table public.cron_auth enable row level security;
insert into public.cron_auth (id, token)
values (1, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;