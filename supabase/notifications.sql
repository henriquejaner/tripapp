-- ─── Notifications table ─────────────────────────────────────────────────────
create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  trip_id     uuid references trips(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "Users see own notifications" on notifications
  for select using (auth.uid() = user_id);
create policy "Users can mark own as read" on notifications
  for update using (auth.uid() = user_id);
create index if not exists idx_notifications_user on notifications(user_id, created_at desc);

-- ─── Function: generate trip notifications ────────────────────────────────────
-- Call this via a Supabase cron job or edge function daily.
-- It creates urgency notifications based on how close the trip is.

create or replace function generate_trip_notifications()
returns void language plpgsql security definer as $$
declare
  r record;
  days_until int;
begin
  for r in
    select t.id as trip_id, t.name, ts.start_date, tm.user_id,
           count(i.id) filter (where i.status = 'idea') as idea_count,
           count(i.id) filter (where i.status = 'confirmed') as confirmed_count
    from trips t
    join trip_stops ts on ts.trip_id = t.id and ts.order_index = 0
    join trip_members tm on tm.trip_id = t.id
    left join ideas i on i.trip_id = t.id
    where t.status != 'completed' and ts.start_date is not null
    group by t.id, t.name, ts.start_date, tm.user_id
  loop
    days_until := (r.start_date - current_date);

    -- 21 days out: first nudge
    if days_until = 21 then
      insert into notifications (user_id, trip_id, type, title, body)
      values (r.user_id, r.trip_id, 'nudge_21',
        '3 weeks to go — ' || r.name,
        'You have ' || r.idea_count || ' ideas but ' || r.confirmed_count || ' confirmed. Time to start deciding.')
      on conflict do nothing;
    end if;

    -- 7 days out: urgent push
    if days_until = 7 then
      insert into notifications (user_id, trip_id, type, title, body)
      values (r.user_id, r.trip_id, 'nudge_7',
        '1 week away — ' || r.name,
        r.idea_count || ' things still undecided. Lock them in before it''s too late.')
      on conflict do nothing;
    end if;

    -- 3 days out: final push
    if days_until = 3 then
      insert into notifications (user_id, trip_id, type, title, body)
      values (r.user_id, r.trip_id, 'nudge_3',
        r.name || ' is in 3 days!',
        'Final chance to confirm open plans. ' || r.idea_count || ' still undecided.')
      on conflict do nothing;
    end if;
  end loop;
end;
$$;
