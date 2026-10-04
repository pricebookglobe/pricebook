-- Fixes "I'm standing right in front of a store and it either names a
-- different one two or three doors down, or says I'm at an unregistered
-- location" — reported from testing in a real row of ~10 stores, each only
-- about 5m wide, side by side.
--
-- Two problems with the 0027 version:
--
-- 1. max_meters defaulted to 100 — in a row of 5m-wide storefronts, 100m
--    sweeps in roughly 20 of them. Any store within that whole stretch was
--    eligible to be "the" match, so an ordinary GPS fix (routinely 5-15m
--    off, worse indoors/near buildings) had a wide field of equally-"within
--    range" neighbors to confuse. Tightened to 20m — still comfortably
--    wider than typical GPS error, but no longer wide enough to span
--    several doors down the row.
--
-- 2. The ambiguity veto (refuse to answer at all when the 2nd-closest
--    candidate is within accuracy_m of the closest) was meant to avoid
--    confidently naming the wrong one of two close-together stores — but
--    in a row of 5m-apart storefronts it fires constantly, since there's
--    almost always a second store within a few meters of the first. The
--    result was exactly the reported "sometimes it just says unregistered"
--    — the real nearest store, correctly identified, being discarded in
--    favor of no answer. Removed: this now always returns the single
--    nearest active store within max_meters, full stop, same principle as
--    "make it as precise as possible but still name the closest store"
--    rather than refusing to guess.
--
-- Signature and return columns are unchanged from 0027, so this is a
-- straight CREATE OR REPLACE — no DROP needed. accuracy_m is kept as a
-- parameter (unused by the query itself now) purely so callers built
-- against 0027's signature don't start failing.
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
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, max_meters)
  order by distance_m asc
  limit 1;
$$;
