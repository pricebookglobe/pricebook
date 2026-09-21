-- Lets the API read back a store's coordinates as plain numbers — the
-- `location` column is a PostGIS geography point, which Postgrest can't
-- unpack directly through a normal select. Powers "Store location" on the
-- merchant Settings page (shows the current pin before it's changed).
create or replace function store_coordinates(p_store_id uuid)
returns table (lat double precision, lng double precision)
language sql stable as $$
  select
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng
  from stores
  where id = p_store_id;
$$;
