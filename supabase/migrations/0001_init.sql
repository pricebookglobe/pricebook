-- PriceBook initial schema
create extension if not exists postgis;
create extension if not exists vector;
create extension if not exists pgcrypto; -- gen_random_uuid()

-- USERS
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  role text not null default 'customer' check (role in ('customer','merchant','admin')),
  phone text,
  created_at timestamptz not null default now()
);

-- STORES
create table stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  location geography(Point, 4326) not null,
  address text,
  city text not null,
  operating_hours jsonb,
  rating numeric(2,1) default 0,
  rating_count integer default 0,
  is_active boolean default true,
  created_at timestamptz not null default now()
);
create index stores_location_gix on stores using gist (location);
create index stores_city_idx on stores (city);

-- PRODUCTS
create table products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  brand text,
  size numeric,
  unit text,
  category text not null,
  barcode text unique,
  image_url text,
  created_at timestamptz not null default now()
);
create index products_category_idx on products (category);
create index products_barcode_idx on products (barcode);

-- PRODUCT_EMBEDDINGS
create table product_embeddings (
  product_id uuid primary key references products(id) on delete cascade,
  embedding vector(1536) not null,
  updated_at timestamptz not null default now()
);
create index product_embeddings_ivfflat on product_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- STORE_INVENTORY
create table store_inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  price numeric(10,2) not null,
  currency text not null default 'JOD',
  in_stock boolean default true,
  updated_at timestamptz not null default now(),
  unique (store_id, product_id)
);
create index store_inventory_product_idx on store_inventory (product_id);
create index store_inventory_store_idx on store_inventory (store_id);

-- PRICE_HISTORY (append-only)
create table price_history (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  price numeric(10,2) not null,
  recorded_at timestamptz not null default now()
);
create index price_history_lookup_idx on price_history (product_id, store_id, recorded_at desc);

-- STORE_RANKINGS
create table store_rankings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  category text not null,
  percentile numeric(5,2) not null,
  zone_radius_km numeric(4,1) not null default 5,
  computed_at timestamptz not null default now(),
  unique (store_id, category, zone_radius_km, computed_at)
);

-- REVIEWS
create table reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);

-- ROW-LEVEL SECURITY
alter table stores enable row level security;
alter table store_inventory enable row level security;

create policy merchant_owns_store on stores
  for all using (owner_id = auth.uid());

create policy merchant_owns_inventory on store_inventory
  for all using (
    store_id in (select id from stores where owner_id = auth.uid())
  );
