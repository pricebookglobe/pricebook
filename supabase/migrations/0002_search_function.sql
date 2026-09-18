-- One round trip: semantic ranking (pgvector) + radius filtering (PostGIS).
create or replace function search_nearby_products(
  query_embedding vector(1536),
  user_lat double precision,
  user_lng double precision,
  radius_meters integer,
  match_limit integer default 30
)
returns table (
  store_id uuid,
  store_name text,
  product_id uuid,
  product_name text,
  price numeric,
  distance_m double precision,
  similarity double precision
) language sql stable as $$
  select
    s.id as store_id,
    s.name as store_name,
    p.id as product_id,
    p.canonical_name as product_name,
    si.price,
    ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) as distance_m,
    1 - (pe.embedding <=> query_embedding) as similarity
  from store_inventory si
  join stores s on s.id = si.store_id
  join products p on p.id = si.product_id
  join product_embeddings pe on pe.product_id = p.id
  where s.is_active
    and si.in_stock
    and ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_meters)
  order by pe.embedding <=> query_embedding, distance_m asc
  limit match_limit;
$$;
