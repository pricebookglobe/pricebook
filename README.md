# PriceBook — MVP Starter

Track Best Prices. Next.js (App Router) + Tailwind, Supabase Postgres with
PostGIS + pgvector, OpenAI GPT-4o for multimodal product search, and a
full account/verification/messaging/review layer on top.

## Run the migrations, in order

In Supabase's SQL Editor, run every file in `supabase/migrations/` **in
numeric order, one at a time**: 0001 through 0007. Each depends on the
ones before it. If you've already run some of these in an earlier session,
just run whichever ones you haven't yet.

Migration 0007 is the big one for this round: extended user/store profile
fields, the store verification workflow, in-app messaging, reviews, and
two new storage buckets (`verification-documents`, private; `store-photos`,
public).

Also check **Authentication → Settings** in Supabase: if "Confirm email"
is on, a merchant signing up lands on a "check your email" step before
finishing store setup (`/store-profile` picks up where signup left off,
including the CR certificate and store photo upload).

## Promote yourself to admin (needed for /admin/verify-stores)

Nothing in the UI can grant the admin role — that's intentional, it should
never be self-service. Run this once in Supabase's SQL Editor, with your
own account's email:

```sql
update users set role = 'admin' where email = 'you@example.com';
```

Then visit `/admin/verify-stores` while logged in as that account to
approve or reject pending merchant registrations.

## Get it running locally

1. Run the migrations above.
2. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase →
   Project Settings → API), and `OPENAI_API_KEY` (platform.openai.com).
   `WEB_SEARCH_API_KEY` is optional.
3. `npm install && npm run dev`, then open http://localhost:3000.
4. Add a few rows to `stores`, `products`, `product_embeddings`, and
   `store_inventory` so search has something to find — a seed script is
   still on the "next" list below.

## What's in this build

- **Design**: a light greenish-blue animated background (`velvet-field` in
  `globals.css`) so the logo's original navy/green colors stay legible
  without recoloring. `PageShell` (centered card, for login/signup/forgot-
  password) and `AppPage` (top-left logo + name + gear + logout, for every
  logged-in page) are the two layout shells — see `components/shared/`.
- **Multi-language**: a genuine "any language" switcher — presets plus a
  free-text box — that calls GPT-4o once per language to translate the UI
  string set (`lib/i18n/strings.ts`) and caches the result in
  `localStorage`. RTL is applied automatically for Arabic/Hebrew/Farsi/Urdu.
- **Accounts**: customer signup collects first/last name, address, city,
  country, and password+confirm with a reveal toggle. Merchant signup
  collects commercial name, registration number, a CR certificate upload,
  a store photo upload, contact person, and admin email — the store then
  sits in `verification_status = 'pending'` until an admin approves it.
  A Postgres trigger (0004, extended in 0007) auto-provisions every new
  Supabase Auth user into `public.users` with these fields.
- **Check price flow** (`app/(customer)/page.tsx`): Snap / Upload / a
  guided category drill-down (`lib/categories.ts` →
  `components/check-price/GuidedTextEntry.tsx`) instead of a single free-
  text box. If a result is within 150m, it's shown first as "you're at
  this store, the price here is X," with a button to reveal the wider
  neighborhood → town → city comparison table.
- **`/api/search`**: GPT-4o extraction (or a pre-structured query from the
  guided flow) → embedding → one combined pgvector + PostGIS RPC call
  (`search_nearby_products`, which also returns each store's trust badge
  and coordinates) → web fallback only if nothing local is a strong match.
- **Per-result actions**: a "⋯" menu for messaging the store or reporting
  the price correct/wrong; "view on map" opens turn-by-turn directions.
  Trust badges (green/orange/red) are computed live from the ratio of
  wrong-price reports.
- **Store detail pages** (`/store/[id]`): reviews (rating stars + comment,
  reviewer identity never returned by the API), a directions button, and
  a view counter the merchant sees on their dashboard.
- **Merchant dashboard**: competitiveness ranking per category, a
  verification-pending banner, view count, and links to inventory
  management, adding items, and messages.
- **Add item** (`/inventory/add`): text, photo, or camera → GPT-4o extracts
  name/brand/manufacturer/size/unit/category into an editable form → set
  price + currency → saves via `/api/products` (find-or-create + embed,
  optionally uploading the photo as the product's image) then
  `/api/stores/[id]/inventory` (price + audit trail together).
- **Merchant inventory** (`/inventory`): every item with its photo, price,
  and a delete button — properly ownership-checked server-side.
- **Merchant messages** (`/messages`): inbox for messages sent from a
  store's "⋯" menu on search results.
- **Settings**: password change, email change (Supabase's double-opt-in
  flow verifies the new address), and a "delete my search history on
  every logout" toggle.
- **Search history** (`/history`): every signed-in search, with per-row
  delete and "Delete all."
- **Currency by location** (`lib/currency.ts`): reverse-geocodes the
  customer's coordinates (OpenStreetMap Nominatim, no key needed) to a
  country, then a currency.

## Honest scope notes

- **The category tree** (`lib/categories.ts`) is a curated, finite set —
  not an exhaustive catalog of every possible item. Easy to extend by
  adding to the array.
- **Translation quality** depends on GPT-4o for whatever language is
  requested. Genuinely "any language," but an obscure name typed into
  "Other…" may translate imperfectly. The five presets are the most tested.
- **The admin panel** is intentionally minimal: a pending-stores list with
  Approve/Reject and links to the uploaded documents, no search/filtering.
- **"You're at this store" detection** uses a 150m radius — works well for
  freestanding shops, can be noisy in dense multi-store buildings.
- **The "city" search tier** is a large fixed radius (1,000km), not a real
  boundary-aware query. Fine for an MVP inside one country; swap for a
  `country_code`/boundary match on `stores` before expanding further.
- **Web fallback** (`lib/webFallback.ts`) returns a reference link, not a
  parsed price yet.
- **Barcode scanning and CSV bulk upload** aren't built.
- **The ranking cron** (`refresh_store_rankings()`, migration 0003) needs a
  scheduler — Supabase's `pg_cron`, or a Render/Vercel Cron Job hitting a
  small route that calls it.
- **Trust badge thresholds** (migration 0005): green under 5% wrong-price
  reports, orange 5–10%, red above 10% — tune once you have real volume.

## Branded email sender (action needed, not code)

Password-reset and confirmation emails currently come from Supabase's
default sender, not a `pricebook.institute-of-ai.org` address. To fix:

1. Supabase → **Project Settings → Auth → SMTP Settings** → enable Custom
   SMTP.
2. Point it at a provider you control for that domain — your DNS already
   has AWS SES records for `send.institute-of-ai.org`, so reusing SES
   (generate SMTP credentials in the SES console) is the quickest path;
   Resend or SendGrid work the same way.
3. Set the "Sender email" to something like `noreply@institute-of-ai.org`.
4. Save, then trigger a password reset to confirm the new sender address.

## Next build session, in order

1. Seed script (`npm run seed`) so search has data without manual inserts.
2. CSV bulk upload for merchants adding many items at once.
3. Cron wiring for `refresh_store_rankings()`.
4. A proper boundary/country-code column for the "city" search tier.
5. Admin panel: search/filter pending stores, bulk actions.
