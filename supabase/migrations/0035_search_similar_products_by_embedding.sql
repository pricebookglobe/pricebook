-- Replaces 0034's category-equality version of search_similar_products.
-- Turns out products.category is free text set per-product at add time,
-- not a fixed list — real data has "Snacks", "snacks", "Confectionery",
-- "Candy Bar", and "Pantry & Snacks" all coexisting for conceptually
-- overlapping items. An exact p.category = query_category match meant
-- "Similar items" usually had almost nothing to show, not because the
-- catalog lacked similar products, but because their category LABELS
-- happened not to match character-for-character.
--
-- Switches to the same embedding comparison search_nearby_products
-- already uses for exact matches, just with a lower similarity floor
-- (min_similarity, default 0.35 — comfortably below the 0.75 floor the
-- exact-match search uses) instead of a hard category filter, so it
-- naturally catches "other stuff in roughly the same space" (other
-- candy bars, other chocolate snacks) without depending on how
-- consistently categories were labeled. exclude_product_ids is still
-- how the caller keeps this from repeating whatever already showed up
-- as an exact match.
drop function if exists search_similar_products(text, double precision, double precision, integer, integer, uuid[]);

create or replace function search_similar_products(
  query_embedding vector(1536),
  user_lat double precision,
  user_lng double precision,
  radius_meters integer,
  match_limit integer default 50,
  min_similarity double precision default 0.35,
  exclude_product_ids uuid[] default '{}'
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
  image_url text,
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
    p.brand,
    p.manufacturer,
    p.size,
    p.unit,
    p.image_url,
    si.price,
    si.currency,
    ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) as distance_m,
    1 - (pe.embedding <=> query_embedding) as similarity,
    trust.badge as trust_badge,
    trust.wrong_pct,
    p.nutrition_facts
  from store_inventory si
  join stores s on s.id = si.store_id
  join products p on p.id = si.product_id
  join product_embeddings pe on pe.product_id = p.id
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
    and not (p.id = any(exclude_product_ids))
    and (1 - (pe.embedding <=> query_embedding)) >= min_similarity
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_meters)
  order by pe.embedding <=> query_embedding, distance_m asc
  limit match_limit;
$$;
