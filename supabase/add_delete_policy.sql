-- Allow trip owners to delete their trips
-- Run this in the Supabase SQL Editor

create policy "Trip owners can delete trips"
  on trips for delete
  using (created_by = auth.uid());
