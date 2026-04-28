-- Add is_public to trips
alter table trips add column if not exists is_public boolean not null default false;

-- Extend trips SELECT policy to include public trips
drop policy if exists "Trip members can view trip" on trips;
create policy "Trip members can view trip" on trips for select
  using (
    is_public = true
    OR public.is_trip_member(trips.id)
    OR created_by = auth.uid()
  );

-- Extend trip_stops to allow reading stops of public trips
drop policy if exists "Trip members can view stops" on trip_stops;
create policy "Trip members can view stops" on trip_stops for select
  using (
    public.is_trip_member(trip_stops.trip_id)
    OR exists (select 1 from trips where id = trip_stops.trip_id and is_public = true)
  );

-- Extend trip_tabs to allow reading tabs of public trips
drop policy if exists "Trip members can view tabs" on trip_tabs;
create policy "Trip members can view tabs" on trip_tabs for select
  using (
    public.is_trip_member(trip_tabs.trip_id)
    OR exists (select 1 from trips where id = trip_tabs.trip_id and is_public = true)
  );

-- Extend ideas to allow reading ideas of public trips
drop policy if exists "Trip members can view ideas" on ideas;
create policy "Trip members can view ideas" on ideas for select
  using (
    public.is_trip_member(ideas.trip_id)
    OR exists (select 1 from trips where id = ideas.trip_id and is_public = true)
  );

-- Allow trip owner to toggle is_public
drop policy if exists "Trip owner can update trip" on trips;
create policy "Trip owner can update trip" on trips for update
  using (created_by = auth.uid());
