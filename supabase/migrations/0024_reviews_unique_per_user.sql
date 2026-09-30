-- Enforces one review per (store, user) at the database level. 0001_init.sql
-- already declared `unique (store_id, user_id)` on the reviews table, but
-- SQL migrations in this repo are NOT run automatically when the app is
-- deployed (Render only builds/deploys the Next.js app) — they have to be
-- run separately against the Supabase project. If that never happened for
-- this table (or happened before this table had any rows, and something
-- since then re-created it without the constraint), the app's upsert had
-- nothing to conflict against and silently inserted a new row on every
-- submit instead of updating the existing one. This migration is safe to
-- run whether or not the constraint already exists.

-- 1) Clean up any duplicate reviews that already exist for the same
--    (store_id, user_id): keep the oldest row (the one a returning
--    reviewer would see as "their" review) and drop the rest.
delete from reviews a using reviews b
where a.store_id = b.store_id
  and a.user_id = b.user_id
  and a.created_at > b.created_at;

-- In the rare case two duplicate rows have the exact same created_at,
-- the above leaves both — break the tie by id so at most one row per
-- (store_id, user_id) survives either way.
delete from reviews a using reviews b
where a.store_id = b.store_id
  and a.user_id = b.user_id
  and a.created_at = b.created_at
  and a.id > b.id;

-- 2) Add the unique constraint if it isn't already there (ADD CONSTRAINT
--    has no IF NOT EXISTS in Postgres, so check pg_constraint first).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'reviews'::regclass
      and conname = 'reviews_store_id_user_id_key'
  ) then
    alter table reviews add constraint reviews_store_id_user_id_key unique (store_id, user_id);
  end if;
end $$;
