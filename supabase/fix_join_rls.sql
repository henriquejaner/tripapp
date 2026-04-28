-- Allow any authenticated user to join a trip (insert their own member row)
-- Also allow members to update their own row (display name, avatar)

create policy "Authenticated users can join trips" on trip_members for insert
  with check (user_id = auth.uid());

create policy "Members can update their own row" on trip_members for update
  using (user_id = auth.uid());
