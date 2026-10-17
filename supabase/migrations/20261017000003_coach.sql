-- Coach inputs only; the calorie plan and workout plan are computed from these on read (never stored, never stale).
create table public.coach_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sex text not null check (sex in ('female', 'male', 'other')),
  birth_year integer not null check (birth_year between 1920 and 2020),
  height_cm numeric not null check (height_cm between 120 and 230),
  activity text not null check (activity in ('sedentary', 'light', 'moderate', 'active')),
  start_weight_kg numeric not null check (start_weight_kg between 30 and 300),
  goal_weight_kg numeric not null check (goal_weight_kg between 30 and 300),
  goal_date date,
  days_per_week smallint not null default 3 check (days_per_week between 2 and 6),
  equipment text not null default 'home' check (equipment in ('home', 'gym')),
  experience text not null default 'beginner' check (experience in ('beginner', 'intermediate')),
  started_on date not null default current_date,
  updated_at timestamptz not null default now()
);

alter table public.coach_profiles enable row level security;
create policy coach_all on public.coach_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
