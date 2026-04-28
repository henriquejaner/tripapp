-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: infinite recursion in trip_members RLS policy
-- Run this in Supabase SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create a security-definer helper that checks membership without triggering RLS
create or replace function public.is_trip_member(trip_uuid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from trip_members
    where trip_id = trip_uuid and user_id = auth.uid()
  );
$$;

-- 2. Drop the recursive policy on trip_members
drop policy if exists "Members can view trip members" on trip_members;

-- 3. Replace it with a non-recursive one using the helper
create policy "Members can view trip members" on trip_members for select
  using (
    user_id = auth.uid()
    or public.is_trip_member(trip_members.trip_id)
  );

-- 4. Also fix other policies that query trip_members directly (same recursion risk
--    when trip_members itself is being read as part of the chain)
--    Rewrite trip_stops, trip_tabs, ideas, flights, documents policies to use helper:

drop policy if exists "Trip members can view stops" on trip_stops;
create policy "Trip members can view stops" on trip_stops for select
  using (public.is_trip_member(trip_stops.trip_id));

drop policy if exists "Trip owners can manage stops" on trip_stops;
create policy "Trip owners can manage stops" on trip_stops for all
  using (exists (select 1 from trips where id = trip_stops.trip_id and created_by = auth.uid()));

drop policy if exists "Trip members can view tabs" on trip_tabs;
create policy "Trip members can view tabs" on trip_tabs for select
  using (public.is_trip_member(trip_tabs.trip_id));

drop policy if exists "Trip members can create tabs" on trip_tabs;
create policy "Trip members can create tabs" on trip_tabs for insert
  with check (public.is_trip_member(trip_tabs.trip_id));

drop policy if exists "Trip members can view ideas" on ideas;
create policy "Trip members can view ideas" on ideas for select
  using (public.is_trip_member(ideas.trip_id));

drop policy if exists "Trip members can add ideas" on ideas;
create policy "Trip members can add ideas" on ideas for insert
  with check (public.is_trip_member(ideas.trip_id));

drop policy if exists "Trip members can update ideas" on ideas;
create policy "Trip members can update ideas" on ideas for update
  using (public.is_trip_member(ideas.trip_id));

drop policy if exists "Trip members can view flights" on flights;
create policy "Trip members can view flights" on flights for select
  using (public.is_trip_member(flights.trip_id));

drop policy if exists "Trip members can add flights" on flights;
create policy "Trip members can add flights" on flights for insert
  with check (public.is_trip_member(flights.trip_id));

drop policy if exists "Trip members can view documents" on documents;
create policy "Trip members can view documents" on documents for select
  using (public.is_trip_member(documents.trip_id));

drop policy if exists "Trip members can upload documents" on documents;
create policy "Trip members can upload documents" on documents for insert
  with check (public.is_trip_member(documents.trip_id));

-- Also fix the trips view policy to use the helper
drop policy if exists "Trip members can view trip" on trips;
create policy "Trip members can view trip" on trips for select
  using (
    public.is_trip_member(trips.id)
    or created_by = auth.uid()
  );
