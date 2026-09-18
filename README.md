# PriceBook — MVP Starter

Track Best Prices. This is a working scaffold of the architecture from the
PriceBook technical spec: Next.js (App Router) + Tailwind, Supabase Postgres
with PostGIS + pgvector, and OpenAI GPT-4o for multimodal product search.

## What's already wired up

- **Accounts** — separate signup flows for customers (`/signup/customer`)
  and merchants (`/signup/merchant`, with commercial name, registration
  number, address, and a "use my location" capture), plus `/login`. A
  Postgres trigger (migration 0004) auto-provisions each new Supabase Auth
  user into `public.users`.
- **Customer search** (`app/(customer)/page.tsx`) — text, photo upload, or
  camera search; results ranked by price across three widening tiers
  (neighborhood 5km → town 25km → country), each row showing distance, a
  "view on map" link, the store's currency, and a trust dot.
- **`/api/search`** — the full pipeline: GPT-4o extraction → embedding →
  one combined pgvector + PostGIS RPC call (`search_nearby_products`) →
  web fallback only if nothing local is a strong match.
- **Price reporting** — every result row lets a logged-in customer flag a
  price "correct" or "wrong" (`/api/reports` → `price_reports` table).
  Each store's trust badge (green/orange/red, by % of wrong-price reports)
  is computed live inside the search function itself.
- **Merchant dashboard** (`app/(merchant)/dashboard/page.tsx`) — reads the
  daily competitiveness percentile per category from `store_rankings`, and
  links to **Add item**.
- **Add item** (`app/(merchant)/inventory/add/page.tsx`) — merchants
  describe an item by text, photo, or camera; GPT-4o extracts the details
  into an editable form; they set the price and currency and save. This
  calls `/api/products` (find-or-create + embed) then
  `/api/stores/[id]/inventory` (writes current price + audit trail together).
- **Currency by location** (`lib/currency.ts`) — reverse-geocodes the
  customer's coordinates (OpenStreetMap Nominatim, no key needed) to a
  country, then a currency, via `lib/countryCurrency.ts`.
- **SQL migrations** (`supabase/migrations/`) — full schema, RLS policies,
  the geo+vector+trust search function, the ranking recompute function,
  and the accounts/reports migration. Run all five, in order.

## Get it running

1. **Create a Supabase project** at supabase.com, then in the SQL editor run
   all five files in `supabase/migrations/` in order (0001 through 0005).
   If you already ran 0001–0003 before, you only need to run the two new
   ones: 0004 (accounts + price reports) and 0005 (replaces the search
   function to add trust badges, currency, and map coordinates).
   Also check **Authentication → Settings** in Supabase: if "Confirm email"
   is on, merchants land on a "check your email" step before finishing
   store setup (`/store-profile` picks up where signup left off); turn it
   off for faster local testing if you don't want that step yet.
2. **Copy `.env.example` to `.env.local`** and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
     from Supabase Project Settings → API.
   - `OPENAI_API_KEY` from platform.openai.com.
   - `WEB_SEARCH_API_KEY` is optional (Serper.dev) — search works without it.
3. **Install and run:**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 for the customer search, and
   http://localhost:3000/dashboard for the merchant view.
4. **Seed some data** — insert a few rows into `users`, `stores`, `products`,
   `product_embeddings` (call `embedProductDescription` from `lib/aiVision.ts`
   for real embeddings), and `store_inventory` so search has something to find.

## What's stubbed or simplified, on purpose

- **Web fallback** (`lib/webFallback.ts`): returns a reference link, not yet
  a parsed price. Add a small GPT-4o call or regex over the snippet before
  relying on `web_estimate.price_estimate`.
- **Barcode scanning, CSV bulk upload**: not yet built — the `/inventory/scan`
  and `/inventory/bulk` routes from the spec aren't in this starter. Barcode
  scan is a native-camera win worth saving for the React Native pass (spec
  Section 8); CSV bulk upload is a good next file to add
  (`app/api/stores/[id]/inventory/bulk/route.ts`, parsing with `papaparse`).
- **Ranking cron**: `refresh_store_rankings()` (0003) needs a scheduler —
  either Supabase's `pg_cron` extension or a Vercel/Render Cron Job hitting a
  small `/api/cron/refresh-rankings` route that calls
  `supabase.rpc("refresh_store_rankings")`.
- **"Country" search tier** (`app/api/search/route.ts`) is a large fixed
  radius (1,000km), not a real border-aware query — fine for an MVP in one
  country, but worth swapping for a `country_code` column match on `stores`
  before expanding to neighboring countries.
- **Trust badge thresholds** (migration 0005): green under 5% wrong-price
  reports, orange 5–10%, red above 10%. Tune these percentages in the SQL
  function's `case` statement once you have real report volume to calibrate
  against.
- **Merchant email confirmation**: if Supabase's "Confirm email" setting is
  on, the merchant signup form can't create the store immediately (no
  session yet) — it sends them to `/login`, and `/store-profile` finishes
  the job after they log in. Turn confirmation off for faster local testing.

## Next build session, in order

1. Seed script so `npm run seed` populates a demo city with a few stores,
   products, and prices — nothing to search until data exists.
2. CSV bulk upload route for merchants adding many items at once.
3. Cron wiring for `refresh_store_rankings()`.
4. A country-code column on `stores` to make the "country" search tier
   border-aware instead of radius-based.
