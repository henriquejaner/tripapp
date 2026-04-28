-- Add transport_type to flights table
-- Supports: flight, train, bus, car, ferry
-- Existing rows default to 'flight' (backward compatible)

alter table flights
  add column if not exists transport_type text not null default 'flight';

-- Optional: add a check constraint for valid values
alter table flights
  drop constraint if exists flights_transport_type_check;

alter table flights
  add constraint flights_transport_type_check
  check (transport_type in ('flight', 'train', 'bus', 'car', 'ferry'));
