-- Powers the new "Similar items" button on the Check Price / Search Items
-- results screen: unlike search_nearby_products (which only returns items
-- that are genuinely the SAME product, gated by embedding similarity),
-- this deliberately returns OTHER products in the same category — e.g.
-- other chocolate bars when the search was "Toblerone Milk Chocolate
-- Almond Nougat [100g]" — so a shopper can see alternatives that may
-- differ in size, brand, and/or manufacturer, not just where to buy the
-- exact item they searched for.
--
-- Category is the product's own `category` column (set when the item was
-- added — products.category has been a required, not-null column since
-- 0001), not an embedding comparison, so this is a plain equality filter
-- rather than a similarity threshold. exclude_product_ids lets the caller
-- drop whatever already
-- showed up in the exact-match results, so "similar items" never just
-- repeats the same list.
create or replace function search_similar_products(
  query_category text,
  user_lat double precision,
  user_lng double precision,
  radius_meters integer,
  match_limit integer default 50,
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
    null::double precision as similarity, -- not a fuzzy/embedding match, so no score to show
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
    and p.category = query_category
    and not (p.id = any(exclude_product_ids))
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_meters)
  order by distance_m asc
  limit match_limit;
$$;
