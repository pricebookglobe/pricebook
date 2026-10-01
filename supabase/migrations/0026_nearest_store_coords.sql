-- The automatic "what store am I at" panel now shows a map of the STORE's
-- own location alongside its front photo (previously it showed only one or
-- the other, and the map fallback centered on the shopper's own position
-- rather than the store). find_nearest_store needs to hand back the
-- store's lat/lng for that map to be possible.
create or replace function find_nearest_store(
  user_lat double precision,
  user_lng double precision,
  max_meters integer default 100
)
returns table (
  store_id uuid,
  store_name text,
  store_photo_url text,
  store_lat double precision,
  store_lng double precision,
  distance_m double precision
) language sql stable as $$
  select
    s.id as store_id,
    s.name as store_name,
    s.store_photo_url as store_photo_url,
    ST_Y(s.location::geometry) as store_lat,
    ST_X(s.location::geometry) as store_lng,
    ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) as distance_m
  from stores s
  where s.is_active
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, max_meters)
  order by distance_m asc
  limit 1;
$$;
