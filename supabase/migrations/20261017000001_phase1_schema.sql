-- Life OS — Phase 1 schema. Every user-owned table has user_id + RLS (user_id = auth.uid()).
-- The Telegram webhook uses the service role and resolves chat_id -> user_id itself.

create extension if not exists pgcrypto;

-- ───────────── profiles ─────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Kolkata',
  calorie_target integer check (calorie_target is null or calorie_target between 500 and 10000),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── telegram linking ─────────────
create table public.telegram_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint not null unique,
  -- short-lived conversational state, e.g. {"type":"edit_qty","item_id":"..."}
  pending_action jsonb,
  linked_at timestamptz not null default now()
);

create table public.link_codes (
  code_hash text primary key,                -- sha256 of the code; plaintext is shown once
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index on public.link_codes (user_id);

-- ───────────── foods ─────────────
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,   -- null = global seeded row
  food_key text not null,                    -- groups variants: 'dosa' -> plain/masala/ghee roast
  name text not null,                        -- display name, e.g. 'Masala dosa'
  variant text,                              -- 'masala'; null when the dish has no variants
  aliases text[] not null default '{}',      -- lowercase, incl. Hindi/Kannada/Telugu transliterations
  serving_desc text not null,                -- '1 medium dosa (~100 g batter)'
  serving_unit text not null default 'serving',
  serving_grams numeric,
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  source text not null check (source in ('ifct2017', 'curated_estimate', 'user')),
  source_ref text,                           -- e.g. IFCT code or note
  created_at timestamptz not null default now()
);
create index foods_key_idx on public.foods (food_key);
create index foods_aliases_idx on public.foods using gin (aliases);
create unique index foods_global_unique on public.foods (food_key, coalesce(variant, ''))
  where user_id is null;

-- ───────────── per-user defaults ─────────────
create table public.user_food_defaults (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_key text not null,
  food_id uuid not null references public.foods(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, food_key)
);

-- ───────────── meal logs ─────────────
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_text text not null,
  logged_at timestamptz not null default now(),
  meal_type text check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired')),
  total_kcal numeric not null default 0,
  telegram_message_id bigint,                -- the bot reply carrying the buttons
  created_at timestamptz not null default now()
);
create index meal_logs_user_time_idx on public.meal_logs (user_id, logged_at desc);

create table public.meal_log_items (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.meal_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  food_key text not null,
  name text not null,
  variant text,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  kcal numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  match_type text not null check (match_type in ('matched', 'estimated', 'unresolved')),
  -- set while the bot is waiting for the user to pick a variant/quantity
  clarify jsonb,
  position smallint not null default 0
);
create index meal_log_items_log_idx on public.meal_log_items (log_id);

-- ───────────── RLS ─────────────
alter table public.profiles enable row level security;
alter table public.telegram_links enable row level security;
alter table public.link_codes enable row level security;
alter table public.foods enable row level security;
alter table public.user_food_defaults enable row level security;
alter table public.meal_logs enable row level security;
alter table public.meal_log_items enable row level security;

create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy telegram_links_select on public.telegram_links for select using (user_id = auth.uid());
create policy telegram_links_delete on public.telegram_links for delete using (user_id = auth.uid());

-- link_codes: created server-side (service role) only; users never read hashes.

create policy foods_select on public.foods for select using (user_id is null or user_id = auth.uid());
create policy foods_insert on public.foods for insert with check (user_id = auth.uid() and source = 'user');
create policy foods_update on public.foods for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy foods_delete on public.foods for delete using (user_id = auth.uid());

create policy ufd_all on public.user_food_defaults for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy meal_logs_all on public.meal_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy meal_log_items_all on public.meal_log_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
