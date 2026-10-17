-- "My day starts at" (local hour, 0–6). Anything logged before it counts toward the previous day.
alter table public.profiles
  add column day_start_hour smallint not null default 4 check (day_start_hour between 0 and 6);
