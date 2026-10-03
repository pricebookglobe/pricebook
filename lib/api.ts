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

export async function findNearestStore(
  lat: number,
  lng: number,
  // The GPS fix's own accuracy radius in meters, when known — lets the
  // server tell two nearby stores apart with confidence instead of
  // guessing when a loose fix puts them within each other's margin of
  // error. Omitted (not just a generous default) when the caller has no
  // real reading, e.g. a manually-picked city.
  accuracy?: number | null
): Promise<{
  store_id: string;
  store_name: string;
  store_photo_url: string | null;
  store_lat: number;
  store_lng: number;
  distance_m: number;
} | null> {
  const res = await fetch("/api/stores/nearby-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, accuracy: typeof accuracy === "number" ? accuracy : undefined })
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't check your location");
  const { store } = await res.json();
  return store;
}
