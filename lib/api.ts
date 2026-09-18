export type SearchResult = {
  store_id: string;
  store_name: string;
  product_id: string;
  product_name: string;
  price: number;
  distance_m: number;
  similarity: number;
};

export type SearchResponse = {
  query: { product_name: string; brand: string | null; size: number | null; unit: string | null; category: string };
  tier: "immediate" | "extended" | "city" | null;
  local_results: SearchResult[];
  web_estimate: { price_estimate: number | null; currency: string; source_url: string | null; note: string } | null;
};

export async function searchProducts(params: {
  text?: string;
  imageBase64?: string;
  lat: number;
  lng: number;
}): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Search failed");
  return res.json();
}

export type RankingRow = { category: string; percentile: number };

export async function getStoreRanking(storeId: string): Promise<RankingRow[]> {
  const res = await fetch(`/api/stores/${storeId}/ranking`);
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load ranking");
  return res.json();
}
