create table if not exists trip_expenses (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  title text not null,
  amount numeric(10,2) not null,
  currency text default 'EUR' not null,
  paid_by_user_id uuid references auth.users(id) on delete set null,
  paid_by_name text not null,
  created_at timestamptz default now() not null
);
alter table trip_expenses enable row level security;
create policy "Trip members can view expenses" on trip_expenses
  for select using (public.is_trip_member(trip_id));
create policy "Trip members can insert expenses" on trip_expenses
  for insert with check (public.is_trip_member(trip_id));
create policy "Expense creator can delete" on trip_expenses
  for delete using (paid_by_user_id = auth.uid());
