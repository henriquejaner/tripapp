-- Safely convert travel_vibe and budget_range from text → text[]
-- Uses add/copy/rename approach to avoid operator conflicts with existing policies

-- 1. Add new array columns
alter table profiles add column if not exists travel_vibe_arr  text[];
alter table profiles add column if not exists budget_range_arr text[];

-- 2. Copy existing single values into the new arrays
update profiles set
  travel_vibe_arr  = case when travel_vibe  is not null then array[travel_vibe]  else null end,
  budget_range_arr = case when budget_range is not null then array[budget_range] else null end;

-- 3. Drop old columns
alter table profiles drop column if exists travel_vibe;
alter table profiles drop column if exists budget_range;

-- 4. Rename new columns to the original names
alter table profiles rename column travel_vibe_arr  to travel_vibe;
alter table profiles rename column budget_range_arr to budget_range;
