# PriceBook — MVP Starter

Track Best Prices. This is a working scaffold of the architecture from the
PriceBook technical spec: Next.js (App Router) + Tailwind, Supabase Postgres
with PostGIS + pgvector, and OpenAI GPT-4o for multimodal product search.

## What's already wired up

- **Customer search** (`app/(customer)/page.tsx`) — text or photo search,
  browser geolocation, results ranked by price within a widening radius.
- **`/api/search`** — the full pipeline: GPT-4o extraction → embedding →
  one combined pgvector + PostGIS RPC call (`search_nearby_products`) →
  web fallback only if nothing local is a strong match.
- **Merchant dashboard** (`app/(merchant)/dashboard/page.tsx`) — reads the
  daily competitiveness percentile per category from `store_rankings`.
- **`/api/stores/[id]/inventory`** — add/update a price; writes to
  `store_inventory` and `price_history` together.
- **SQL migrations** (`supabase/migrations/`) — full schema, RLS policies,
  the geo+vector search function, and the nightly ranking recompute function.

## Get it running

1. **Create a Supabase project** at supabase.com, then in the SQL editor run
   the three files in `supabase/migrations/` in order (0001, 0002, 0003).
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

- **Auth**: `lib/supabaseClient.ts` has both a browser and service-role
  client, and the schema's RLS policies (0001) assume Supabase Auth, but the
  merchant dashboard currently points at a `DEMO_STORE_ID` placeholder — wire
  up Supabase Auth (email/password or magic link) next, then swap that
  constant for the signed-in user's store.
- **Web fallback** (`lib/webFallback.ts`): returns a reference link, not yet
  a parsed price. Add a small GPT-4o call or regex over the snippet before
  relying on `web_estimate.price_estimate`.
- **Barcode scanning, CSV bulk upload**: not yet built — the `/inventory/scan`
  and `/inventory/bulk` routes from the spec aren't in this starter. Barcode
  scan is a native-camera win worth saving for the React Native pass (spec
  Section 8); CSV bulk upload is a good next file to add
  (`app/api/stores/[id]/inventory/bulk/route.ts`, parsing with `papaparse`).
- **Ranking cron**: `refresh_store_rankings()` (0003) needs a scheduler —
  either Supabase's `pg_cron` extension or a Vercel Cron Job hitting a small
  `/api/cron/refresh-rankings` route that calls `supabase.rpc("refresh_store_rankings")`.

## Next build session, in order

1. Supabase Auth (merchant + customer roles) and swap out `DEMO_STORE_ID`.
2. Store profile + inventory CRUD pages under `app/(merchant)/`.
3. Seed script so `npm run seed` populates a demo city with a few stores.
4. CSV bulk upload route.
5. Cron wiring for `refresh_store_rankings()`.
