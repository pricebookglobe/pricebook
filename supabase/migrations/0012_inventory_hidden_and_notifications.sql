-- "Hide/unhide" is deliberately separate from "available/unavailable"
-- (in_stock): a hidden item is invisible to customers no matter what,
-- while an unavailable item can still exist as a listing that's just out
-- of stock. Both must be true for a customer to see it in search.
alter table store_inventory add column if not exists is_hidden boolean not null default false;

-- Same as 0005's version, plus the is_hidden filter, so a hidden item
-- never surfaces in customer search results.
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
  store_lat double precision,
  store_lng double precision,
  product_id uuid,
  product_name text,
  price numeric,
  currency text,
  distance_m double precision,
  similarity double precision,
  trust_badge text,
  wrong_pct numeric
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
    1 - (pe.embedding <=> query_embedding) as similarity,
    trust.badge as trust_badge,
    trust.wrong_pct
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
  order by pe.embedding <=> query_embedding, distance_m asc
  limit match_limit;
$$;

-- Per-store, dismissible notification feed for incoming reviews. Kept as
-- its own table rather than a flag on `reviews` itself, so a merchant
-- dismissing a notification never touches the underlying review — it
-- stays fully intact and visible to customers on the store's public page
-- either way. Dismissing deletes the notification row, not the review.
create table if not exists store_review_notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  review_id uuid not null references reviews(id) on delete cascade,
  rating integer not null,
  created_at timestamptz not null default now(),
  unique (review_id)
);

create or replace function notify_store_of_review() returns trigger language plpgsql as $$
begin
  insert into store_review_notifications (store_id, review_id, rating, created_at)
  values (new.store_id, new.id, new.rating, new.created_at)
  on conflict (review_id) do update set rating = excluded.rating;
  return new;
end;
$$;

drop trigger if exists trg_notify_store_of_review on reviews;
create trigger trg_notify_store_of_review
  after insert or update on reviews
  for each row execute function notify_store_of_review();

-- Backfill notifications for reviews that already existed before this
-- migration ran.
insert into store_review_notifications (store_id, review_id, rating, created_at)
select store_id, id, rating, created_at from reviews
on conflict (review_id) do nothing;
