-- Phase 2 (health sync) + Phase 3 (habits, journal). All user-owned tables: user_id + RLS.

-- ───────────── API tokens for /api/health/ingest ─────────────
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  token_hash text not null unique,          -- sha256 of the token; plaintext is shown once, never stored
  token_prefix text not null,               -- first chars, for recognising a token in the UI
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index on public.api_tokens (user_id);

-- ───────────── daily health metrics (nullable: not every metric arrives every day) ─────────────
create table public.health_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,                       -- the user's LOCAL calendar day
  active_kcal numeric check (active_kcal is null or active_kcal between 0 and 20000),
  resting_kcal numeric check (resting_kcal is null or resting_kcal between 0 and 20000),
  steps integer check (steps is null or steps between 0 and 200000),
  sleep_minutes integer check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  weight_kg numeric check (weight_kg is null or weight_kg between 20 and 400),
  workouts jsonb,
  source text not null default 'shortcut',
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Idempotent merge: re-sending a day never double-counts, and a partial push never erases other metrics.
create or replace function public.upsert_health_daily(p_user uuid, p_date date, p_data jsonb, p_source text)
returns void language sql security definer set search_path = public as $$
  insert into public.health_daily (user_id, date, active_kcal, resting_kcal, steps, sleep_minutes, weight_kg, workouts, source)
  values (
    p_user, p_date,
    (p_data->>'active_kcal')::numeric, (p_data->>'resting_kcal')::numeric, (p_data->>'steps')::integer,
    (p_data->>'sleep_minutes')::integer, (p_data->>'weight_kg')::numeric, p_data->'workouts', p_source
  )
  on conflict (user_id, date) do update set
    active_kcal   = coalesce(excluded.active_kcal, health_daily.active_kcal),
    resting_kcal  = coalesce(excluded.resting_kcal, health_daily.resting_kcal),
    steps         = coalesce(excluded.steps, health_daily.steps),
    sleep_minutes = coalesce(excluded.sleep_minutes, health_daily.sleep_minutes),
    weight_kg     = coalesce(excluded.weight_kg, health_daily.weight_kg),
    workouts      = coalesce(excluded.workouts, health_daily.workouts),
    source        = excluded.source,
    updated_at    = now();
$$;
revoke all on function public.upsert_health_daily(uuid, date, jsonb, text) from public, anon, authenticated;

-- ───────────── habits ─────────────
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  emoji text not null default '✅',
  weekdays smallint[],                      -- ISO weekdays 1=Mon..7=Sun; null = every day
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]))
);
create index on public.habits (user_id);

create table public.habit_logs (
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,                       -- local calendar day; row exists = done
  created_at timestamptz not null default now(),
  primary key (habit_id, date)
);
create index on public.habit_logs (user_id, date);

-- ───────────── journal ─────────────
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  mood smallint check (mood between 1 and 5),
  notes text not null default '' check (char_length(notes) <= 5000),
  tags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ───────────── RLS ─────────────
alter table public.api_tokens enable row level security;
alter table public.health_daily enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.journal_entries enable row level security;

-- tokens: users can see and revoke their own; creation and hashing happen server-side only
create policy api_tokens_select on public.api_tokens for select using (user_id = auth.uid());
create policy api_tokens_revoke on public.api_tokens for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- health data is written by the ingest endpoint (service role); users read their own
create policy health_select on public.health_daily for select using (user_id = auth.uid());

create policy habits_all on public.habits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habit_logs_all on public.habit_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy journal_all on public.journal_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
