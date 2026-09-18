-- USERS previously had no RLS — since 0001 never enabled it, every row was
-- readable through the anon key by anyone. Lock it down: a user can only
-- read/update their own row. (The signup trigger runs as SECURITY DEFINER,
-- so it still works regardless of these policies.)
alter table users enable row level security;
create policy user_reads_own_row on users for select using (id = auth.uid());
create policy user_updates_own_row on users for update using (id = auth.uid());

-- SEARCH_HISTORY: a customer's past searches, deletable one-by-one or all at once.
create table search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  query_text text not null,
  category text,
  searched_at timestamptz not null default now()
);
create index search_history_user_idx on search_history (user_id, searched_at desc);

alter table search_history enable row level security;
create policy user_reads_own_history on search_history for select using (user_id = auth.uid());
create policy user_inserts_own_history on search_history for insert with check (user_id = auth.uid());
create policy user_deletes_own_history on search_history for delete using (user_id = auth.uid());

-- PRODUCT IMAGES: a public bucket so a photo taken during "Add item" can be
-- shown back on search results and the merchant's inventory list.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy product_images_public_read on storage.objects
  for select using (bucket_id = 'product-images');
create policy product_images_authenticated_upload on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');
