-- Sub-trips / splits support
-- Run in Supabase SQL Editor → New query

alter table trips add column if not exists parent_trip_id uuid references trips(id) on delete cascade;
alter table trips add column if not exists split_note text;

-- Index for fast lookup of sub-trips by parent
create index if not exists idx_trips_parent on trips(parent_trip_id);

-- Allow trip members to view sub-trips of trips they're in
-- (the is_trip_member helper handles this automatically since sub-trips
--  have their own trip_members rows — no policy change needed)
