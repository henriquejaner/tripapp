-- ─────────────────────────────────────────────────────────────────────────────
-- Trip App — Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensions
create extension if not exists "uuid-ossp";

-- ─── Profiles ─────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid primary key references auth.users on delete cascade,
  username      text unique,
  full_name     text,
  avatar_url    text,
  travel_vibe   text check (travel_vibe in ('cultural', 'party', 'outdoors', 'mixed')),
  group_size_pref integer,
  budget_range  text check (budget_range in ('budget', 'mid', 'luxury')),
  travel_frequency text,
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, onboarded)
  values (new.id, new.raw_user_meta_data->>'full_name', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Trips ────────────────────────────────────────────────────────────────────
create table if not exists trips (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  created_by    uuid references profiles(id) on delete set null,
  invite_code   text not null unique,
  status        text not null default 'planning' check (status in ('planning', 'confirmed', 'completed')),
  cover_image   text,
  created_at    timestamptz not null default now()
);

-- ─── Trip Stops ───────────────────────────────────────────────────────────────
create table if not exists trip_stops (
  id            uuid primary key default uuid_generate_v4(),
  trip_id       uuid not null references trips(id) on delete cascade,
  destination   text not null,
  start_date    date,
  end_date      date,
  order_index   integer not null default 0
);

-- ─── Trip Members ─────────────────────────────────────────────────────────────
create table if not exists trip_members (
  id            uuid primary key default uuid_generate_v4(),
  trip_id       uuid not null references trips(id) on delete cascade,
  user_id       uuid references profiles(id) on delete set null,
  display_name  text not null,
  role          text not null default 'member' check (role in ('owner', 'member')),
  avatar_url    text,
  joined_at     timestamptz not null default now(),
  unique(trip_id, user_id)
);

-- ─── Trip Tabs ────────────────────────────────────────────────────────────────
create table if not exists trip_tabs (
  id            uuid primary key default uuid_generate_v4(),
  trip_id       uuid not null references trips(id) on delete cascade,
  name          text not null,
  icon          text not null default '📌',
  order_index   integer not null default 0,
  created_by    uuid references profiles(id) on delete set null
);

-- ─── Ideas ────────────────────────────────────────────────────────────────────
create table if not exists ideas (
  id            uuid primary key default uuid_generate_v4(),
  tab_id        uuid not null references trip_tabs(id) on delete cascade,
  trip_id       uuid not null references trips(id) on delete cascade,
  created_by    uuid references profiles(id) on delete set null,
  creator_name  text,
  title         text not null,
  description   text,
  url           text,
  estimated_cost numeric(10,2),
  currency      text not null default '€',
  status        text not null default 'idea' check (status in ('idea', 'confirmed')),
  confirmed_at  timestamptz,
  vote_count    integer not null default 0,
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ─── Idea Votes ───────────────────────────────────────────────────────────────
create table if not exists idea_votes (
  id            uuid primary key default uuid_generate_v4(),
  idea_id       uuid not null references ideas(id) on delete cascade,
  user_id       uuid references profiles(id) on delete set null,
  member_id     uuid references trip_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique(idea_id, user_id)
);

-- ─── Flights ──────────────────────────────────────────────────────────────────
create table if not exists flights (
  id                uuid primary key default uuid_generate_v4(),
  trip_id           uuid not null references trips(id) on delete cascade,
  stop_id           uuid references trip_stops(id) on delete set null,
  airline           text,
  flight_number     text,
  departure_airport text not null,
  arrival_airport   text not null,
  departure_time    timestamptz,
  arrival_time      timestamptz,
  price             numeric(10,2),
  currency          text not null default '€',
  added_by          uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ─── Documents ────────────────────────────────────────────────────────────────
create table if not exists documents (
  id            uuid primary key default uuid_generate_v4(),
  trip_id       uuid not null references trips(id) on delete cascade,
  name          text not null,
  url           text not null,
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table trips enable row level security;
alter table trip_stops enable row level security;
alter table trip_members enable row level security;
alter table trip_tabs enable row level security;
alter table ideas enable row level security;
alter table idea_votes enable row level security;
alter table flights enable row level security;
alter table documents enable row level security;

-- Profiles: users can read all, update own
create policy "Profiles are viewable by all" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Trips: members can read, authenticated users can create
create policy "Trip members can view trip" on trips for select
  using (
    exists (select 1 from trip_members where trip_id = trips.id and user_id = auth.uid())
    or created_by = auth.uid()
  );
create policy "Authenticated users can create trips" on trips for insert
  with check (auth.uid() is not null);
create policy "Trip owners can update trips" on trips for update
  using (created_by = auth.uid());

-- Trip stops: same as trips
create policy "Trip members can view stops" on trip_stops for select
  using (exists (select 1 from trip_members where trip_id = trip_stops.trip_id and user_id = auth.uid()));
create policy "Trip owners can manage stops" on trip_stops for all
  using (exists (select 1 from trips where id = trip_stops.trip_id and created_by = auth.uid()));

-- Trip members: members can view all members of their trips
create policy "Members can view trip members" on trip_members for select
  using (
    user_id = auth.uid()
    or exists (select 1 from trip_members tm where tm.trip_id = trip_members.trip_id and tm.user_id = auth.uid())
  );
create policy "Authenticated users can join trips" on trip_members for insert
  with check (auth.uid() is not null);

-- Trip tabs: trip members can view and create
create policy "Trip members can view tabs" on trip_tabs for select
  using (exists (select 1 from trip_members where trip_id = trip_tabs.trip_id and user_id = auth.uid()));
create policy "Trip members can create tabs" on trip_tabs for insert
  with check (exists (select 1 from trip_members where trip_id = trip_tabs.trip_id and user_id = auth.uid()));

-- Ideas: trip members can CRUD
create policy "Trip members can view ideas" on ideas for select
  using (exists (select 1 from trip_members where trip_id = ideas.trip_id and user_id = auth.uid()));
create policy "Trip members can add ideas" on ideas for insert
  with check (exists (select 1 from trip_members where trip_id = ideas.trip_id and user_id = auth.uid()));
create policy "Trip members can update ideas" on ideas for update
  using (exists (select 1 from trip_members where trip_id = ideas.trip_id and user_id = auth.uid()));

-- Idea votes: trip members can vote
create policy "Trip members can view votes" on idea_votes for select
  using (exists (
    select 1 from ideas i
    join trip_members tm on tm.trip_id = i.trip_id
    where i.id = idea_votes.idea_id and tm.user_id = auth.uid()
  ));
create policy "Trip members can vote" on idea_votes for insert
  with check (auth.uid() is not null);
create policy "Users can delete own votes" on idea_votes for delete
  using (user_id = auth.uid());

-- Flights: trip members can CRUD
create policy "Trip members can view flights" on flights for select
  using (exists (select 1 from trip_members where trip_id = flights.trip_id and user_id = auth.uid()));
create policy "Trip members can add flights" on flights for insert
  with check (exists (select 1 from trip_members where trip_id = flights.trip_id and user_id = auth.uid()));

-- Documents: trip members can view and upload
create policy "Trip members can view documents" on documents for select
  using (exists (select 1 from trip_members where trip_id = documents.trip_id and user_id = auth.uid()));
create policy "Trip members can upload documents" on documents for insert
  with check (exists (select 1 from trip_members where trip_id = documents.trip_id and user_id = auth.uid()));

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_trip_members_user on trip_members(user_id);
create index if not exists idx_trip_members_trip on trip_members(trip_id);
create index if not exists idx_trip_stops_trip on trip_stops(trip_id);
create index if not exists idx_trip_tabs_trip on trip_tabs(trip_id);
create index if not exists idx_ideas_tab on ideas(tab_id);
create index if not exists idx_ideas_trip on ideas(trip_id);
create index if not exists idx_idea_votes_idea on idea_votes(idea_id);
create index if not exists idx_flights_trip on flights(trip_id);
create index if not exists idx_trips_invite_code on trips(invite_code);
