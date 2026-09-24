-- Barcode-scanned items from different sources can legitimately describe
-- the same real product differently (Open Food Facts might list brand as
-- "Snickers" while a store's own listing says "Mars") — no amount of text
-- cleanup fully solves that mismatch for similarity-based matching. This
-- adds a real, unambiguous path: store the actual barcode number on the
-- product, so a future barcode scan for the same product can match on
-- the exact number instead of relying on fuzzy text similarity at all.
alter table products add column if not exists barcode text;
create index if not exists idx_products_barcode on products (barcode) where barcode is not null;

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
