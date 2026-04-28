-- The join bug: non-members can't read a trip by invite_code because RLS blocks them.
-- Fix: RPC function with SECURITY DEFINER that bypasses RLS for invite lookup only.

create or replace function get_trip_by_invite_code(code text)
returns setof trips
language sql
security definer
set search_path = public
as $$
  select * from trips where upper(invite_code) = upper(code) limit 1;
$$;

-- Grant execute to authenticated and anon (so pre-login invite links work too)
grant execute on function get_trip_by_invite_code(text) to authenticated, anon;

-- Ensure INSERT policy exists on trip_members (idempotent)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'trip_members' and policyname = 'Authenticated users can join trips'
  ) then
    execute 'create policy "Authenticated users can join trips" on trip_members for insert with check (user_id = auth.uid())';
  end if;
end $$;
