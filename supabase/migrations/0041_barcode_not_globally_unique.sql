-- A barcode identifies what's printed on the label, but the SAME barcode
-- can legitimately appear on more than one real listing — a single can and
-- a 6-pack of that same can often share one barcode, as do some brands'
-- different sizes. The original schema (0001_init.sql) made barcode
-- globally UNIQUE across the whole products table, so saving a second
-- pack/size variant under a barcode already used by a different-sized
-- product failed outright — the insert hit the unique-constraint
-- violation and the request blew up instead of returning a clean error
-- (surfacing to the merchant as an opaque "Unexpected end of JSON input").
--
-- The real uniqueness boundary is barcode + the fields that actually
-- distinguish one SKU from another (pack_size, size, unit) — that still
-- stops a true duplicate of the exact same listing, while allowing
-- different pack sizes/sizes that happen to share a barcode.
alter table products drop constraint if exists products_barcode_key;

create unique index if not exists products_barcode_sku_key
  on products (barcode, pack_size, size, unit)
  where barcode is not null;
