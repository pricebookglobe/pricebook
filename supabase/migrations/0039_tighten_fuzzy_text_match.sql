-- 0038's word-overlap fallback required only HALF of the query's
-- meaningful words to show up in a product's name/brand. In production
-- that was too loose: a search for "Ultra Bottled Drinking Water" reduces
-- (after dropping filler words "bottled"/"drinking") to the two words
-- {ultra, water}, and needing only 1 of those 2 to match let the single
-- generic word "water" alone pull in completely unrelated products —
-- "San Pellegrino Sparkling Natural Mineral Water", "Signature Select
-- Spring Water" — into the main exact-match results, not just "Ultra
-- Water" itself.
--
-- Now requires ALL of the query's meaningful words to appear somewhere in
-- the product's name/brand (full coverage, not a majority). "ultra water"
-- -> {ultra, water}, both needed -> still matches "Ultra Bottled Drinking
-- Water" (has both), no longer matches "San Pellegrino..." (has "water"
-- but not "ultra"). Those same-category-but-different-product listings
-- now fall through to search_similar_products' embedding search instead,
-- landing in "Similar items" where they belong, rather than being merged
-- into the same-item comparison table.
--
-- Same return shape as 0038 — plain CREATE OR REPLACE, no drop needed.
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
        ) = wc.n
      )
    )
  order by distance_m asc
  limit match_limit;
$$;
