-- Telegram nudges, workout logging, eating-out / drinks budget.

alter table public.profiles
  add column nudges_enabled boolean not null default true,
  add column wake_hour smallint not null default 7 check (wake_hour between 0 and 23),
  add column sleep_hour smallint not null default 22 check (sleep_hour between 1 and 24),
  add column paused_until timestamptz,
  add column last_nudge_at timestamptz,
  add column last_review_on date,
  add column monthly_out_budget smallint not null default 4 check (monthly_out_budget between 0 and 31),
  add column monthly_drink_budget smallint not null default 2 check (monthly_drink_budget between 0 and 31);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  title text not null,
  minutes smallint check (minutes is null or minutes between 1 and 600),
  note text,
  created_at timestamptz not null default now()
);
create index workout_sessions_user_date_idx on public.workout_sessions (user_id, date desc);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null,
  sets smallint not null check (sets between 1 and 50),
  reps smallint not null check (reps between 1 and 500),
  weight_kg numeric check (weight_kg is null or weight_kg between 0 and 1000),
  position smallint not null default 0
);
create index workout_sets_session_idx on public.workout_sets (session_id);
create index workout_sets_user_exercise_idx on public.workout_sets (user_id, exercise);

-- eating out / drinks. allowance_kcal is what the day is allowed to go over; it is "banked" from the 3 days before.
create table public.social_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('out', 'drinks')),
  note text,
  allowance_kcal integer not null default 0 check (allowance_kcal between 0 and 3000),
  created_on date not null,
  created_at timestamptz not null default now()
);
create index social_events_user_date_idx on public.social_events (user_id, date);

alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.social_events enable row level security;
create policy workout_sessions_all on public.workout_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy workout_sets_all on public.workout_sets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy social_events_all on public.social_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
