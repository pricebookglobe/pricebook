-- "Similar items" was entirely dependent on embedding closeness (>= 0.6
-- similarity) to bridge across brands — "Lipton tea bags" relying on
-- "Twinings tea bags" happening to land close enough in embedding space.
-- In practice that under-delivers: a search for one brand's product often
-- showed only that same brand's own other listings, never a genuinely
-- different brand selling the same type of thing, because category text
-- was historically too inconsistent to trust as a matching signal
-- (migration 0035 — "Snacks" vs "snacks" vs "Confectionery" per product).
--
-- Category is no longer free text in practice: the Add Item flow now
-- picks it from a fixed dropdown (lib/categories.ts's CATEGORY_TREE), so
-- new listings share real, comparable category values. This adds an
-- explicit category-based path alongside the existing embedding one —
-- same category as the query, different product entirely (any brand/
-- name), nearby. A plain case/whitespace-insensitive match, not a fuzzy
-- one: the category field is now a controlled vocabulary, not prose.
create or replace function search_similar_products_by_category(
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
    -- Not an embedding/text score — a plain category match. Placed below
    -- the embedding floor (0.6) and the exact-match floor (0.75) so it
    -- never outranks a real similarity score when the two overlap (see
    -- the merge order in app/api/search/route.ts).
    0.5::double precision as similarity,
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
    and not (p.id = any(exclude_product_ids))
    and p.category is not null
    and lower(trim(p.category)) = lower(trim(query_category))
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_meters)
  order by distance_m asc
  limit match_limit;
$$;
