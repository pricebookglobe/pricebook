-- Powers the "Find My Location" button on the Check Price tab. Independent
-- of any product search — just "is there a registered store right here?" —
-- so it's a plain nearest-store lookup rather than reusing
-- search_nearby_products (which requires a product embedding).
create or replace function find_nearest_store(
  user_lat double precision,
  user_lng double precision,
  max_meters integer default 150
)
returns table (
  store_id uuid,
  store_name text,
  distance_m double precision
) language sql stable as $$
  select
    s.id as store_id,
    s.name as store_name,
    ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) as distance_m
  from stores s
  where s.is_active
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, max_meters)
  order by distance_m asc
  limit 1;
$$;
