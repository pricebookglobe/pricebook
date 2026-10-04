-- Companion to 0030: that migration made find_nearest_store confidently
-- return ONE store within 20m instead of refusing to answer when two were
-- close together — but "confidently pick one" still means a misread GPS fix
-- can confidently pick the WRONG one in a dense row of storefronts. Rather
-- than trying to squeeze more certainty out of consumer GPS (which typically
-- can't do better than 5-20m, often worse indoors/near buildings — tighter
-- than a row of 5m-wide shops), the UI now shows the auto-detected store
-- plus its close neighbors so the shopper can confirm or correct it in one
-- tap. This function is what feeds that list.
--
-- Same shape as find_nearest_store's result columns, but returns every
-- active store within range (nearest first, capped at 8) instead of just
-- the closest one.
create or replace function find_nearby_stores(
  user_lat double precision,
  user_lng double precision,
  max_meters integer default 20
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
  limit 8;
$$;
