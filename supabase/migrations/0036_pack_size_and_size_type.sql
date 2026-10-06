-- Pack Size: how many individual units are sold together in one listing
-- (a 6-pack of Coca-Cola cans, a 12-pack or 24-pack of water bottles, a
-- bundle/offer pack) — distinct from Size, which stays the size of ONE
-- individual unit in the pack (e.g. 330 ml per can). A plain single item
-- is pack_size 1, which is why every existing row backfills to 1 rather
-- than null: "how many are in this pack" always has a real answer, it's
-- just usually "one."
alter table products add column if not exists pack_size integer not null default 1;
alter table products add column if not exists size_type text not null default 'units'
  check (size_type in ('weight', 'volume', 'length', 'units'));

-- Backfill existing rows' size_type from whatever unit they already have,
-- rather than leaving every pre-existing product stuck on the 'units'
-- default regardless of what it's actually measured in — a product
-- already listed as "1 L" should read as Volume, not Units, the moment
-- this column exists.
update products set size_type = case
  when lower(unit) in ('ml', 'l', 'liter', 'litre', 'liters', 'litres') then 'volume'
  when lower(unit) in ('g', 'kg', 'gram', 'grams', 'kilogram', 'kilograms') then 'weight'
  when lower(unit) in ('cm', 'm', 'mm', 'meter', 'meters', 'metre', 'metres') then 'length'
  else 'units'
end
where unit is not null;

comment on column products.pack_size is 'How many individual units are sold together in this listing (default 1 = a single item). The size/unit columns describe ONE of those units, not the pack as a whole.';
comment on column products.size_type is 'What the size/unit columns measure: weight, volume, length, or a plain unit count.';
