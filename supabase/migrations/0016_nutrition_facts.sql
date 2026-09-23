-- Nutrition facts live on the shared products table, not per-store
-- inventory, since the same product's nutrition info is the same no
-- matter which store sells it. Stored as JSONB so the specific fields
-- (calories, protein, etc.) can evolve without another migration.
alter table products add column if not exists nutrition_facts jsonb;
