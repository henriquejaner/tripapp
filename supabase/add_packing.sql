create table if not exists packing_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  title text not null,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  assigned_to_name text,
  checked boolean default false not null,
  checked_by_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null
);
alter table packing_items enable row level security;
create policy "Trip members can view packing" on packing_items
  for select using (public.is_trip_member(trip_id));
create policy "Trip members can insert packing" on packing_items
  for insert with check (public.is_trip_member(trip_id));
create policy "Trip members can update packing" on packing_items
  for update using (public.is_trip_member(trip_id));
create policy "Item creator can delete" on packing_items
  for delete using (created_by = auth.uid());
