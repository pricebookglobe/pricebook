-- Regression from 0021: searching "Toblerone Milk Chocolate Almond Nougat"
-- matched an unrelated store's plain product named "Milk" and reported it
-- as a confident match (similarity 0.99) — cheaper, but a completely
-- different product — because the reverse-direction check
-- (`query_text ilike '%' || p.canonical_name || '%'`) treats ANY product
-- name that happens to appear as a whole word inside a longer query as a
-- match. That's fine for a specific, multi-word name, but a short generic
-- name like "Milk", "Water", or "Bread" is a substring of huge numbers of
-- unrelated real queries, so it turned into a source of false positives
-- rather than a helpful fallback.
--
-- The forward direction — the item's stored name contains what the user
-- typed (`p.canonical_name ilike '%' || query_text || '%'`) — is what
-- actually fixes the original "Snick" -> "Snickers" case (typing a partial
-- prefix of a longer registered name) and doesn't have this failure mode,
-- since it requires the STORED name to be the longer, more specific side
-- of the comparison. Dropping the reverse direction removes the false
-- positive while keeping that fix intact; the embedding search already
-- covers "a longer descriptive query for a short registered name" well on
-- its own.
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
