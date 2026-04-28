create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  trip_id uuid references trips(id) on delete cascade,
  type text not null, -- 'idea_added', 'member_joined', 'idea_confirmed', 'comment_added'
  message text not null,
  trip_name text,
  read boolean default false not null,
  created_at timestamptz default now() not null
);
alter table notifications enable row level security;
create policy "Users can view own notifications" on notifications
  for select using (user_id = auth.uid());
create policy "System can insert notifications" on notifications
  for insert with check (true);
create policy "Users can update own notifications" on notifications
  for update using (user_id = auth.uid());
