-- "Snickers" found a match, but "Snick" (a partial, mid-typing version of
-- the same word) didn't. The embedding-based search only ever compares
-- meaning, not spelling, so a truncated or partial word can land far
-- enough from the full word's embedding to miss the 0.75 similarity floor
-- entirely, even though the two are obviously "the same product" to a
-- human. This adds a second, deterministic path alongside the embedding
-- search: a plain substring match against the product's stored name and
-- brand. It catches any case where the entered text is literally contained
-- in (or contains) the registered name — typing "Snick" now matches
-- "Snickers" outright, in any language, since it's a text match rather
-- than a translation or semantic guess.
--
-- Mirrors search_nearby_products_by_barcode: same shape, same trust-badge
-- calculation, merged into results the same way (adds matches, never
-- replaces the embedding search's own results).
create extension if not exists pg_trgm;

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
  price numeric,
  currency text,
  distance_m double precision,
  similarity double precision,
  trust_badge text,
  wrong_pct numeric,
  nutrition_facts jsonb
) language sql stable as $$
  select
    s.id as store_id,
    s.name as store_name,
    ST_Y(s.location::geometry) as store_lat,
    ST_X(s.location::geometry) as store_lng,
    p.id as product_id,
    p.canonical_name as product_name,
    si.price,
    si.currency,
    ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) as distance_m,
    -- Not a real similarity score (this is a plain substring match, not an
    -- embedding comparison) — reported as a strong, above-threshold value
    -- so it's treated the same as a confident embedding match downstream.
    0.99::double precision as similarity,
    trust.badge as trust_badge,
    trust.wrong_pct,
    p.nutrition_facts
  from store_inventory si
  join stores s on s.id = si.store_id
  join products p on p.id = si.product_id
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
    and (
      p.canonical_name ilike '%' || query_text || '%'
      or query_text ilike '%' || p.canonical_name || '%'
      or (p.brand is not null and p.brand ilike '%' || query_text || '%')
    )
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_meters)
  order by distance_m asc
  limit match_limit;
$$;
