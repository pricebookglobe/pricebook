-- find_nearest_store and find_nearby_stores (0030/0031) only ever checked
-- s.is_active — but is_active defaults to true at signup and nothing in the
-- app ever sets it false. A store's actual "is this a real, vetted
-- business" gate is verification_status ('pending' -> 'approved'/'rejected',
-- set by an admin — see app/api/admin/stores/[id]/verify/route.ts), which
-- these two functions never looked at. The practical effect: the moment a
-- merchant finishes signup, their still-unreviewed store was immediately
-- eligible to be auto-detected as "you are at X" and listed as a pick in
-- the location-correction list, right alongside real, approved stores —
-- an "unregistered" store showing up as if it were a real one.
--
-- Both now also require verification_status = 'approved'. Nearest-first
-- ordering (already correct — plain `order by distance_m asc`) and the
-- correction list itself (find_nearby_stores, already returning every
-- candidate within range) are unchanged; this migration only tightens the
-- WHERE clause.
--
-- Signatures/return columns are unchanged, so both are a straight CREATE OR
-- REPLACE — no DROP needed.
create or replace function find_nearest_store(
  user_lat double precision,
  user_lng double precision,
  max_meters integer default 20,
  accuracy_m double precision default 5
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
    and s.verification_status = 'approved'
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, max_meters)
  order by distance_m asc
  limit 1;
$$;

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
    and s.verification_status = 'approved'
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, max_meters)
  order by distance_m asc
  limit 8;
$$;
