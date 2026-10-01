-- The automatic "what store am I at" panel on Check Price now shows the
-- store's own front photo (falling back to the map only when the store
-- hasn't uploaded one), so the nearest-store lookup needs to hand back
-- store_photo_url alongside the name/distance it already returned.
--
-- Also tightens the default radius from 150m to 100m: with many stores
-- potentially registered in the same area, the closest one within 100m is
-- shown by name; anything farther than that reads as an unregistered
-- location instead of guessing at a store that's actually a different one
-- down the street.
create or replace function find_nearest_store(
  user_lat double precision,
  user_lng double precision,
  max_meters integer default 100
)
returns table (
  store_id uuid,
  store_name text,
  store_photo_url text,
  distance_m double precision
) language sql stable as $$
  select
    s.id as store_id,
    s.name as store_name,
    s.store_photo_url as store_photo_url,
    ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) as distance_m
  from stores s
  where s.is_active
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, max_meters)
  order by distance_m asc
  limit 1;
$$;
