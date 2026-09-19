-- USERS: split name, add address fields, and a privacy preference.
alter table users add column if not exists first_name text;
alter table users add column if not exists last_name text;
alter table users add column if not exists address text;
alter table users add column if not exists city text;
alter table users add column if not exists country text;
alter table users add column if not exists delete_history_on_logout boolean not null default false;

-- STORES: verification workflow + documents + contact + view analytics.
alter table stores add column if not exists contact_person_name text;
alter table stores add column if not exists admin_email text;
alter table stores add column if not exists cr_certificate_url text;
alter table stores add column if not exists store_photo_url text;
alter table stores add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending', 'approved', 'rejected'));
alter table stores add column if not exists view_count integer not null default 0;

-- PRODUCTS: manufacturer, distinct from brand (e.g. brand "Al Ain",
-- manufacturer "Al Ain Farms Co.").
alter table products add column if not exists manufacturer text;

-- STORE_MESSAGES: a customer's message to a store's contact, e.g. asking
-- about stock or a price.
create table store_messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  from_user_id uuid not null references users(id) on delete cascade,
  subject text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index store_messages_store_idx on store_messages (store_id, created_at desc);

alter table store_messages enable row level security;
create policy sender_reads_own_messages on store_messages for select using (from_user_id = auth.uid());
create policy merchant_reads_store_messages on store_messages for select using (
  store_id in (select id from stores where owner_id = auth.uid())
);
create policy anyone_authenticated_sends_message on store_messages for insert with check (from_user_id = auth.uid());
create policy merchant_marks_message_read on store_messages for update using (
  store_id in (select id from stores where owner_id = auth.uid())
);

-- REVIEWS: table already existed unused since 0001 — enable RLS now that
-- it's wired up. Reviewer identity is hidden at the application layer
-- (the API never returns user_id or email to other customers), not here.
alter table reviews enable row level security;
create policy anyone_reads_reviews on reviews for select using (true);
create policy user_writes_own_review on reviews for insert with check (user_id = auth.uid());
create policy user_updates_own_review on reviews for update using (user_id = auth.uid());

-- STORAGE: verification documents are private (only the uploading merchant
-- or an admin should ever read them); store photos are public like product
-- images.
insert into storage.buckets (id, name, public)
values ('verification-documents', 'verification-documents', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('store-photos', 'store-photos', true)
on conflict (id) do nothing;

create policy verification_docs_owner_read on storage.objects
  for select to authenticated using (
    bucket_id = 'verification-documents'
    and (
      owner = auth.uid()
      or exists (select 1 from public.users where id = auth.uid() and role = 'admin')
    )
  );
create policy verification_docs_authenticated_upload on storage.objects
  for insert to authenticated with check (bucket_id = 'verification-documents');

create policy store_photos_public_read on storage.objects
  for select using (bucket_id = 'store-photos');
create policy store_photos_authenticated_upload on storage.objects
  for insert to authenticated with check (bucket_id = 'store-photos');

-- Atomic view-count increment, called when a customer opens a store's detail page.
create or replace function increment_store_view(p_store_id uuid)
returns void language sql as $$
  update stores set view_count = view_count + 1 where id = p_store_id;
$$;

-- Public store info (name, address, coordinates) for the store detail page —
-- a plain select can't pull lat/lng out of a geography column as scalars.
create or replace function get_store_public_info(p_store_id uuid)
returns table (
  id uuid,
  name text,
  address text,
  city text,
  lat double precision,
  lng double precision,
  rating numeric,
  rating_count integer
) language sql stable as $$
  select
    s.id, s.name, s.address, s.city,
    ST_Y(s.location::geometry) as lat,
    ST_X(s.location::geometry) as lng,
    s.rating, s.rating_count
  from stores s
  where s.id = p_store_id and s.is_active;
$$;

-- Extends the 0006 signup trigger to also copy the new profile fields from
-- signup metadata, so they land correctly even when email confirmation
-- delays session creation (client-side writes to `users` aren't possible
-- without a session yet, so everything has to arrive via the trigger).
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, full_name, role, first_name, last_name, address, city, country)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    coalesce(new.raw_user_meta_data->>'role', 'customer'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'country'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
