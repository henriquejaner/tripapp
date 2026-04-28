create table if not exists idea_comments (
  id uuid default gen_random_uuid() primary key,
  idea_id uuid references ideas(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  display_name text not null,
  content text not null,
  created_at timestamptz default now() not null
);

alter table idea_comments enable row level security;

create policy "Trip members can read comments" on idea_comments
  for select using (
    exists (
      select 1 from ideas i
      join trip_tabs tt on tt.id = i.tab_id
      where i.id = idea_comments.idea_id
        and public.is_trip_member(tt.trip_id)
    )
  );

create policy "Trip members can insert comments" on idea_comments
  for insert with check (
    user_id = auth.uid() and
    exists (
      select 1 from ideas i
      join trip_tabs tt on tt.id = i.tab_id
      where i.id = idea_comments.idea_id
        and public.is_trip_member(tt.trip_id)
    )
  );
