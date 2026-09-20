-- For each product a store sells, ranks that store's price against every
-- other store in the same city selling the same product. percentile is
-- computed across ALL stores citywide (partitioned per product), then
-- filtered down to just the rows belonging to p_store_id — that's what the
-- CTE is for: percent_rank() has to see every competitor to be meaningful,
-- but the caller only wants their own store's resulting rank.
create or replace function get_store_product_positions(p_store_id uuid)
returns table (
  product_id uuid,
  product_name text,
  price numeric,
  currency text,
  percentile numeric
) language sql stable as $$
  with ranked as (
    select
      si.store_id,
      si.product_id,
      p.canonical_name as product_name,
      si.price,
      si.currency,
      round((100 * percent_rank() over (partition by si.product_id order by si.price))::numeric, 1) as percentile
    from store_inventory si
    join products p on p.id = si.product_id
    join stores s on s.id = si.store_id
    where s.is_active
      and si.in_stock
      and s.city = (select city from stores where id = p_store_id)
  )
  select product_id, product_name, price, currency, percentile
  from ranked
  where store_id = p_store_id
  order by product_name;
$$;
