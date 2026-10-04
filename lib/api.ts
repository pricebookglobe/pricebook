export type ProductSuggestion = {
  product_id: string;
  product_name: string;
  brand: string | null;
  size: number | null;
  unit: string | null;
  image_url: string | null;
};

// Typeahead for FreeTextSearch — see app/api/products/suggestions/route.ts
// and migration 0032 for what this actually queries. Never throws: a
// suggestions dropdown failing to load shouldn't block typing or searching,
// so this resolves to an empty list on any error instead.
export async function suggestProducts(text: string): Promise<ProductSuggestion[]> {
  try {
    const res = await fetch("/api/products/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!res.ok) return [];
    const { suggestions } = await res.json();
    return suggestions ?? [];
  } catch {
    return [];
  }
}

export type NutritionFacts = {
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
};

export type SearchResult = {
  store_id: string;
  store_name: string;
  store_lat: number;
  store_lng: number;
  product_id: string;
  product_name: string;
  // Added alongside product_id so the client can confirm two matches are
  // genuinely the same item (same size, same manufacturer) before ever
  // comparing their prices — see supabase/migrations/0028 for why this
  // isn't just trusted to product_id alone.
  brand: string | null;
  manufacturer: string | null;
  size: number | null;
  unit: string | null;
  // The product's own photo, set during "Add item" (an uploaded photo, or
  // the image a barcode lookup returned) — not a store photo.
  image_url: string | null;
  price: number;
  currency: string;
  distance_m: number;
  similarity: number;
  trust_badge: "green" | "orange" | "red" | "unrated";
  wrong_pct: number;
  nutrition_facts: NutritionFacts | null;
};

export type SearchResponse = {
  query: { product_name: string; brand: string | null; size: number | null; unit: string | null; category: string };
  tier: "neighborhood" | "town" | "city" | null;
  local_results: SearchResult[];
  web_estimate: { price_estimate: number | null; currency: string; source_url: string | null; note: string } | null;
  // The single cheapest match within 5km, and the single cheapest match
  // anywhere in the city-wide search — independent of what's in
  // local_results, so "the best price in the whole city" can point to a
  // store further away than the neighborhood tier ever looks.
  near_best: SearchResult | null;
  city_best: SearchResult | null;
  // Other products in the same category as the search — could differ in
  // size, brand, and/or manufacturer from what was actually searched for
  // (e.g. other chocolate bars for a Toblerone search). Powers the
  // "Similar items" view, separate from local_results' exact matches.
  similar_results: SearchResult[];
};

export async function searchProducts(params: {
  text?: string;
  imageBase64?: string;
  structured?: { product_name: string; brand?: string | null; size?: number | null; unit?: string | null; category: string };
  barcode?: string;
  lat: number;
  lng: number;
  accessToken?: string;
}): Promise<SearchResponse> {
  const { accessToken, ...body } = params;
  const res = await fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Search failed");
  return res.json();
}

export async function reportPrice(params: {
  store_id: string;
  product_id: string;
  report_type: "correct_price" | "wrong_price";
  accessToken: string;
}): Promise<void> {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.accessToken}` },
    body: JSON.stringify({
      store_id: params.store_id,
      product_id: params.product_id,
      report_type: params.report_type
    })
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't submit report");
}

export type RankingRow = { category: string; percentile: number };

export async function getStoreRanking(storeId: string): Promise<RankingRow[]> {
  const res = await fetch(`/api/stores/${storeId}/ranking`);
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load ranking");
  return res.json();
}

export type NearbyStore = {
  store_id: string;
  store_name: string;
  store_photo_url: string | null;
  store_lat: number;
  store_lng: number;
  distance_m: number;
};

// Returns every active store within range (nearest first) rather than just
// the closest one, so the UI can show the auto-detected pick alongside its
// close neighbors — GPS alone can't reliably tell apart storefronts a few
// meters apart, so letting the shopper confirm or correct in one tap beats
// silently committing to a single guess.
export async function findNearbyStores(
  lat: number,
  lng: number,
  // The GPS fix's own accuracy radius in meters, when known — passed through
  // for older databases still on the single-store fallback chain (see the
  // API route); find_nearby_stores itself doesn't use it.
  accuracy?: number | null
): Promise<NearbyStore[]> {
  const res = await fetch("/api/stores/nearby-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, accuracy: typeof accuracy === "number" ? accuracy : undefined })
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't check your location");
  const { stores } = await res.json();
  return stores ?? [];
}
