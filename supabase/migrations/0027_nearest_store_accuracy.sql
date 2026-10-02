-- Three things in one pass:
--
-- 1. Re-declares find_nearest_store with everything 0025 (store_photo_url)
--    and 0026 (store_lat/store_lng) already added, so running just this
--    file brings a database up to date even if one of those two was
--    skipped — "You are at [store]" showing only a map and never the
--    storefront photo is exactly what happens when the live function
--    predates 0025/0026 (it simply doesn't have that column to return).
--
-- 2. Keeps max_meters' default at 100: a shopper has to be within 100m of
--    a store for it to ever be offered as a match at all.
--
-- 3. Adds accuracy_m: when the shopper's GPS fix isn't precise enough to
--    tell two nearby stores apart (the gap between the nearest and
--    second-nearest candidate is smaller than the fix's own margin of
--    error), this returns no match rather than confidently naming the
--    wrong one. Defaults to 5 — a fix with 5m or better accuracy is
--    enough to resolve two stores that aren't right on top of each other.
create or replace function find_nearest_store(
  user_lat double precision,
  user_lng double precision,
  max_meters integer default 100,
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
  with candidates as (
    select
      s.id as store_id,
      s.name as store_name,
      s.store_photo_url as store_photo_url,
      ST_Y(s.location::geometry) as store_lat,
      ST_X(s.location::geometry) as store_lng,
      ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) as distance_m
    from stores s
    where s.is_active
      -- cast a slightly wider net than max_meters so a second, almost-as-
      -- close store can still be seen for the ambiguity check below.
      and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, max_meters + coalesce(accuracy_m, 5))
  ),
  ranked as (
    select *, row_number() over (order by distance_m asc) as rn
    from candidates
  )
  select r1.store_id, r1.store_name, r1.store_photo_url, r1.store_lat, r1.store_lng, r1.distance_m
  from ranked r1
  where r1.rn = 1
    and r1.distance_m <= max_meters
    and not exists (
      select 1 from ranked r2
      where r2.rn = 2
        and r2.distance_m <= r1.distance_m + coalesce(accuracy_m, 5)
    );
$$;
