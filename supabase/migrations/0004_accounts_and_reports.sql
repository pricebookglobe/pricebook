-- Merchant registration detail
alter table stores add column if not exists commercial_registration text;

-- PRICE_REPORTS: customers flag a store's listed price as correct or wrong.
-- One live report per (user, store, product) — reporting again updates it
-- rather than piling up duplicates.
create table price_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  report_type text not null check (report_type in ('correct_price','wrong_price')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, product_id, user_id)
);
create index price_reports_store_idx on price_reports (store_id);

alter table price_reports enable row level security;
create policy anyone_can_read_reports on price_reports for select using (true);
create policy user_reports_own_flag on price_reports for insert with check (user_id = auth.uid());
create policy user_updates_own_flag on price_reports for update using (user_id = auth.uid());

-- Auto-create a row in public.users whenever someone signs up via Supabase
-- Auth, so the app never has to remember to do this itself. role/full_name
-- come from the signup call's options.data (see lib/supabaseClient.ts callers).
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- users.id should match auth.users.id (Supabase's convention) rather than
-- generating its own — drop the old default so inserts must supply it.
alter table users alter column id drop default;
