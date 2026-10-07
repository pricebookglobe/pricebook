-- search_nearby_products_by_text previously required the ENTIRE parsed
-- query to appear as one contiguous substring of a product's name/brand
-- (e.g. query "ultra water" needed "ultra water" literally inside
-- canonical_name). That missed genuinely matching products whose name
-- just has extra or reordered words — "Ultra Bottled Drinking Water"
-- never matched a search for "Ultra water" or "drinking water", even
-- though a shopper would obviously call that the same item. It fell
-- through to the embedding-only similarity search instead, which — for a
-- generic query like "drinking water" with no brand name in it — often
-- scored below the 0.75 "exact match" floor, so the item showed up only
-- under "Similar items" instead of as a real result.
--
-- Now: an exact substring match (either direction isn't needed, this was
-- always query-in-name) still counts immediately as before, but when that
-- fails, at least half of the query's meaningful words (3+ letters,
-- common filler like "bottled"/"drinking"/"pack" excluded) matching
-- somewhere in the product's name or brand is enough. "drinking water" ->
-- meaningful word is just "water", which matches "Ultra Water" outright.
-- "ultra water" -> "ultra"/"water", either one hitting "Ultra Bottled
-- Drinking Water" clears the 1-of-2 bar.
--
-- Same return shape as before, so this is a plain CREATE OR REPLACE — no
-- drop/recreate needed (that's only required when the column list itself
-- changes).
create or replace function search_nearby_products_by_text(
  query_text text,
  user_lat double precision,
  user_lng double precision,
  radius_meters integer,
  match_limit integer default 30
)
returns table (
  store_id uuid,
  store_name text,
  store_lat double precision,
  store_lng double precision,
  product_id uuid,
  product_name text,
  brand text,
  manufacturer text,
  size numeric,
  unit text,
  pack_size integer,
  size_type text,
  image_url text,
  price numeric,
  currency text,
  distance_m double precision,
  similarity double precision,
  trust_badge text,
  wrong_pct numeric,
  nutrition_facts jsonb
) language sql stable as $$
  with query_words as (
    select distinct qword
    from unnest(regexp_split_to_array(lower(trim(query_text)), '\s+')) as qword
    where length(qword) >= 3
      and qword not in (
        'the', 'and', 'with', 'for', 'pack', 'bottle', 'bottled', 'drinking',
        'pure', 'natural', 'fresh', 'brand', 'new'
      )
  ),
  word_count as (
    select count(*) as n from query_words
  )
  select
    s.id as store_id,
    s.name as store_name,
    ST_Y(s.location::geometry) as store_lat,
    ST_X(s.location::geometry) as store_lng,
    p.id as product_id,
    p.canonical_name as product_name,
    p.brand,
    p.manufacturer,
    p.size,
    p.unit,
    p.pack_size,
    p.size_type,
    p.image_url,
    si.price,
    si.currency,
    ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) as distance_m,
    0.99::double precision as similarity,
    trust.badge as trust_badge,
    trust.wrong_pct,
    p.nutrition_facts
  from store_inventory si
  join stores s on s.id = si.store_id
  join products p on p.id = si.product_id
  cross join word_count wc
  left join lateral (
    select
      case
        when count(*) = 0 then 'unrated'
        when (count(*) filter (where report_type = 'wrong_price'))::numeric / count(*) > 0.10 then 'red'
        when (count(*) filter (where report_type = 'wrong_price'))::numeric / count(*) >= 0.05 then 'orange'
        else 'green'
      end as badge,
      round(
        coalesce((count(*) filter (where report_type = 'wrong_price'))::numeric / nullif(count(*), 0) * 100, 0),
        1
      ) as wrong_pct
    from price_reports pr
    where pr.store_id = s.id
  ) trust on true
  where s.is_active
    and si.in_stock
    and not si.is_hidden
    and length(trim(query_text)) >= 2
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_meters)
    and (
      p.canonical_name ilike '%' || query_text || '%'
      or (p.brand is not null and p.brand ilike '%' || query_text || '%')
      or (
        wc.n > 0
        and (
          select count(*)
          from query_words qw
          where p.canonical_name ilike '%' || qw.qword || '%'
             or (p.brand is not null and p.brand ilike '%' || qw.qword || '%')
        ) >= greatest(1, ceil(wc.n::numeric / 2))
      )
    )
  order by distance_m asc
  limit match_limit;
$$;
