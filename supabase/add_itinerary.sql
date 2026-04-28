create table if not exists itinerary_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  date date not null,
  title text not null,
  description text,
  time_start text,           -- "09:00" 24h format, nullable = no specific time
  category text default 'activity' not null,
                             -- 'transport' | 'accommodation' | 'food' | 'activity' | 'nightlife' | 'other'
  idea_id uuid references ideas(id) on delete set null,
  order_index integer default 0 not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null
);

alter table itinerary_items enable row level security;

create policy "Trip members can view itinerary" on itinerary_items
  for select using (public.is_trip_member(trip_id));

create policy "Trip members can insert itinerary" on itinerary_items
  for insert with check (public.is_trip_member(trip_id));

create policy "Trip members can update itinerary" on itinerary_items
  for update using (public.is_trip_member(trip_id));

create policy "Trip members can delete itinerary" on itinerary_items
  for delete using (public.is_trip_member(trip_id));
