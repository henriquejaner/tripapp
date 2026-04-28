-- Trigger: notify trip owner when a new member joins
create or replace function notify_member_joined()
returns trigger language plpgsql security definer as $$
declare
  v_owner_id uuid;
  v_trip_name text;
begin
  select created_by, name into v_owner_id, v_trip_name from trips where id = new.trip_id;
  if v_owner_id is not null and v_owner_id != coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into notifications (user_id, trip_id, type, message, trip_name)
    values (v_owner_id, new.trip_id, 'member_joined', new.display_name || ' joined your trip!', v_trip_name);
  end if;
  return new;
end;
$$;

drop trigger if exists on_member_joined on trip_members;
create trigger on_member_joined
  after insert on trip_members
  for each row execute function notify_member_joined();

-- Trigger: notify all trip members when a new idea is added
create or replace function notify_idea_added()
returns trigger language plpgsql security definer as $$
declare
  v_member record;
  v_trip_name text;
  v_creator_name text;
begin
  select name into v_trip_name from trips where id = new.trip_id;
  v_creator_name := coalesce(new.creator_name, 'Someone');
  for v_member in
    select user_id from trip_members
    where trip_id = new.trip_id
      and user_id is not null
      and user_id != coalesce(new.created_by, '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    insert into notifications (user_id, trip_id, type, message, trip_name)
    values (v_member.user_id, new.trip_id, 'idea_added', v_creator_name || ' added "' || new.title || '"', v_trip_name);
  end loop;
  return new;
end;
$$;

drop trigger if exists on_idea_added on ideas;
create trigger on_idea_added
  after insert on ideas
  for each row execute function notify_idea_added();

-- Trigger: notify all trip members when an idea is confirmed
create or replace function notify_idea_confirmed()
returns trigger language plpgsql security definer as $$
declare
  v_member record;
  v_trip_name text;
begin
  if old.status = 'idea' and new.status = 'confirmed' then
    select name into v_trip_name from trips where id = new.trip_id;
    for v_member in
      select user_id from trip_members where trip_id = new.trip_id and user_id is not null
    loop
      insert into notifications (user_id, trip_id, type, message, trip_name)
      values (v_member.user_id, new.trip_id, 'idea_confirmed', '"' || new.title || '" was confirmed!', v_trip_name);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists on_idea_confirmed on ideas;
create trigger on_idea_confirmed
  after update on ideas
  for each row execute function notify_idea_confirmed();
