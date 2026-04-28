-- Add people_count column to trips
-- Run in Supabase SQL Editor → New query

alter table trips add column if not exists people_count integer;
