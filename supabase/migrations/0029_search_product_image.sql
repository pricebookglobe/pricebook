-- Adds the product's own photo (products.image_url — set during "Add
-- item," either an uploaded photo or the image a barcode lookup
-- returned) to every search result row, so the Check Price / Search
-- Items results screen can show one product image above the product
-- name instead of nothing.
--
-- Same reason as 0028 for dropping before recreating: Postgres won't let
-- CREATE OR REPLACE change a function's return columns.
drop function if exists search_nearby_products(vector, double precision, double precision, integer, integer, double precision, text, double precision);
drop function if exists search_nearby_products_by_text(text, double precision, double precision, integer, integer);
drop function if exists search_nearby_products_by_barcode(text, double precision, double precision, integer, integer);

create or replace function search_nearby_products(
  query_embedding vector(1536),
  user_lat double precision,
  user_lng double precision,
  radius_meters integer,
  match_limit integer default 30,
  query_size double precision default null,
  query_unit text default null,
  min_similarity double precision default 0.75
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
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_meters)
    and (1 - (pe.embedding <=> query_embedding)) >= min_similarity
  order by
    case
      when query_size is null or query_unit is null or p.size is null or p.unit is null then 1
      when lower(p.unit) = lower(query_unit) and abs(p.size - query_size) <= greatest(p.size * 0.08, 0.01) then 0
      else 2
    end,
    pe.embedding <=> query_embedding,
    distance_m asc
  limit match_limit;
$$;

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
      or (p.brand is not null and p.brand ilike '%' || query_text || '%')
    )
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_meters)
  order by distance_m asc
  limit match_limit;
$$;

create or replace function search_nearby_products_by_barcode(
  target_barcode text,
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
    1.0::double precision as similarity, -- exact barcode match, not a fuzzy score
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
    and p.barcode = target_barcode
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_meters)
  order by distance_m asc
  limit match_limit;
$$;
