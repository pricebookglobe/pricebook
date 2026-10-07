-- One-time cleanup for data saved before lib/units.ts existed: products
-- already in the table can have the same real unit spelled differently
-- ("50g" vs "50grams"), which breaks every exact-match comparison that
-- looks at unit text directly — size/pack filter chips splitting one real
-- size into separate chips, "same item" grouping (Save badges,
-- cheapest-nearby) missing real matches between listings that are
-- actually identical.
--
-- New writes are already normalized at the API layer (see
-- app/api/products/route.ts and the bulk-inventory route), so this is
-- purely about fixing rows that were saved before that existed. Same
-- canonical mapping as lib/units.ts, kept in sync by hand since one lives
-- in Postgres and the other in TypeScript.
update products set unit = 'g' where lower(trim(unit)) in ('g', 'gram', 'grams', 'gm', 'gms') and unit is distinct from 'g';
update products set unit = 'kg' where lower(trim(unit)) in ('kg', 'kilogram', 'kilograms', 'kgs') and unit is distinct from 'kg';
update products set unit = 'ml' where lower(trim(unit)) in ('ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres') and unit is distinct from 'ml';
update products set unit = 'L' where lower(trim(unit)) in ('l', 'liter', 'liters', 'litre', 'litres') and unit is distinct from 'L';
update products set unit = 'cm' where lower(trim(unit)) in ('cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres') and unit is distinct from 'cm';
update products set unit = 'm' where lower(trim(unit)) in ('m', 'meter', 'meters', 'metre', 'metres') and unit is distinct from 'm';
update products set unit = 'pcs' where lower(trim(unit)) in ('pcs', 'pc', 'piece', 'pieces', 'unit', 'units', 'pack') and unit is distinct from 'pcs';
