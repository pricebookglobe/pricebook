-- Recomputes each store's cheapest-percentile rank per category, among
-- competitors within 5km. Call this from a nightly cron (e.g. Supabase's
-- pg_cron, or a scheduled Vercel route) via: select refresh_store_rankings();
create or replace function refresh_store_rankings()
returns void language plpgsql as $$
begin
  insert into store_rankings (store_id, category, percentile, zone_radius_km)
  select
    ranked.store_id,
    ranked.category,
    ranked.pct * 100 as percentile,
    5 as zone_radius_km
  from (
    select
      s1.id as store_id,
      p.category,
      percent_rank() over (
        partition by p.category, s1.id
        order by avg_price
      ) as pct
    from stores s1
    join lateral (
      select p.category, avg(si.price) as avg_price
      from store_inventory si
      join products p on p.id = si.product_id
      join stores s2 on s2.id = si.store_id
      where s2.is_active
        and ST_DWithin(s1.location, s2.location, 5000)
      group by p.category
    ) p on true
    where s1.is_active
  ) ranked;
end;
$$;
