import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { extractProductFromImage, parseTextQuery, embedProductDescription } from "@/lib/aiVision";
import { webFallbackSearch } from "@/lib/webFallback";

// "city" is an approximation (a large fixed radius), not a real
// city/country-boundary-aware query — good enough for an MVP, worth
// swapping for a proper boundary match on `stores` once that exists.
const RADII_M = {
  neighborhood: 5_000,
  town: 25_000,
  city: 1_000_000
} as const;

const SIMILARITY_FALLBACK_THRESHOLD = 0.75;

export async function POST(req: NextRequest) {
  const { text, imageBase64, structured: preStructured, lat, lng, barcode } = await req.json();
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }
  if (!text && !imageBase64 && !preStructured) {
    return NextResponse.json({ error: "Provide text, imageBase64, or structured" }, { status: 400 });
  }

  try {
    // A guided category-picker submission arrives already structured, so it
    // skips the GPT extraction step entirely — it's more accurate than
    // re-parsing text we already know the shape of.
    const structured = preStructured
      ? preStructured
      : imageBase64
      ? await extractProductFromImage(imageBase64)
      : await parseTextQuery(text);

    const embedding = await embedProductDescription(structured);
    const supabase = createServiceSupabase();

    // Merges two result sets for the same radius by store: an exact
    // barcode match is added in on top of the normal embedding search,
    // never used to replace it — a barcode match only proves that one
    // specific store's item is a certain match, it says nothing about
    // whether other nearby stores also carry the product (they likely do,
    // just entered by typing or a photo rather than scanning, so they'd
    // have no barcode on file at all). Excluding those would mean a
    // successful barcode match on one store's item made every other
    // store's genuine listing invisible, which is the opposite of what a
    // barcode match should do — it should only ever add confidence, not
    // take visibility away from anything else.
    function mergeByStore(...rowSets: any[][]): any[] {
      const byStore = new Map<string, any>();
      // Later sets win over earlier ones for the same store — callers pass
      // sets in ascending confidence order (weakest first).
      for (const rows of rowSets) {
        for (const row of rows) byStore.set(row.store_id, row);
      }
      return Array.from(byStore.values());
    }

    // A plain substring match against the product's stored name/brand, in
    // addition to the embedding search. Embeddings compare *meaning*, so a
    // partial or truncated word ("Snick" while still typing "Snickers")
    // can land far enough from the full word's embedding to miss the
    // similarity floor entirely — even though it's obviously the same
    // product to a human. This catches that case outright.
    //
    // Deliberately uses the PARSED product_name (structured.product_name),
    // not the raw `text` the user typed: parseTextQuery translates/
    // transliterates into the common English/Latin-script name products are
    // actually registered under, so a substring check against it still has
    // a real chance of hitting even when the user typed in Arabic (or any
    // other script) — a raw-text substring check against an Arabic query
    // could never match a Latin-script canonical_name at all.
    const partialTextQuery = (structured.product_name ?? text ?? "").trim();

    let tierUsed: keyof typeof RADII_M | null = null;
    let results: any[] = [];

    for (const [tier, meters] of Object.entries(RADII_M) as [keyof typeof RADII_M, number][]) {
      const { data: embeddingRows, error } = await supabase.rpc("search_nearby_products", {
        query_embedding: embedding,
        user_lat: lat,
        user_lng: lng,
        radius_meters: meters,
        match_limit: 30,
        query_size: structured.size ?? null,
        query_unit: structured.unit ?? null,
        min_similarity: SIMILARITY_FALLBACK_THRESHOLD
      });
      if (error) throw error;

      let textRows: any[] = [];
      if (partialTextQuery.length >= 2) {
        const { data, error: textError } = await supabase.rpc("search_nearby_products_by_text", {
          query_text: partialTextQuery,
          user_lat: lat,
          user_lng: lng,
          radius_meters: meters,
          match_limit: 30
        });
        if (textError) throw textError;
        textRows = data ?? [];
      }

      let barcodeRows: any[] = [];
      if (barcode) {
        const { data, error: barcodeError } = await supabase.rpc("search_nearby_products_by_barcode", {
          target_barcode: barcode,
          user_lat: lat,
          user_lng: lng,
          radius_meters: meters,
          match_limit: 30
        });
        if (barcodeError) throw barcodeError;
        barcodeRows = data ?? [];
      }

      // Priority (highest confidence wins for a given store): embedding
      // similarity < substring text match < exact barcode match.
      const merged = mergeByStore(embeddingRows ?? [], textRows, barcodeRows);
      if (merged.length) {
        results = merged;
        tierUsed = tier;
        break;
      }
    }

    const strongMatches = results.filter((r) => r.similarity > SIMILARITY_FALLBACK_THRESHOLD);
    const webEstimate = strongMatches.length ? null : await webFallbackSearch(structured);

    // Separate from the tiered `results` above (which is what fills the
    // results table and stops widening as soon as some tier has a hit).
    // This one dedicated city-wide query lets us call out "the best price
    // near you" versus "the best price in the whole city" side by side,
    // even when they're different stores — the neighborhood tier alone
    // can't tell us that, since it never looks past 5km once it has a hit.
    let nearBest: any = null;
    let cityBest: any = null;
    const { data: cityWideEmbedding } = await supabase.rpc("search_nearby_products", {
      query_embedding: embedding,
      user_lat: lat,
      user_lng: lng,
      radius_meters: RADII_M.city,
      match_limit: 50,
      query_size: structured.size ?? null,
      query_unit: structured.unit ?? null,
      min_similarity: SIMILARITY_FALLBACK_THRESHOLD
    });
    let cityWideText: any[] = [];
    if (partialTextQuery.length >= 2) {
      const { data } = await supabase.rpc("search_nearby_products_by_text", {
        query_text: partialTextQuery,
        user_lat: lat,
        user_lng: lng,
        radius_meters: RADII_M.city,
        match_limit: 50
      });
      cityWideText = data ?? [];
    }
    let cityWideBarcode: any[] = [];
    if (barcode) {
      const { data } = await supabase.rpc("search_nearby_products_by_barcode", {
        target_barcode: barcode,
        user_lat: lat,
        user_lng: lng,
        radius_meters: RADII_M.city,
        match_limit: 50
      });
      cityWideBarcode = data ?? [];
    }
    const cityWide = mergeByStore(cityWideEmbedding ?? [], cityWideText, cityWideBarcode);
    if (cityWide.length) {
      const strongCityWide = cityWide.filter((r: any) => r.similarity > SIMILARITY_FALLBACK_THRESHOLD);
      const pool = strongCityWide.length ? strongCityWide : cityWide;
      const nearbyPool = pool.filter((r: any) => r.distance_m <= RADII_M.neighborhood);
      nearBest = nearbyPool.length ? [...nearbyPool].sort((a: any, b: any) => a.price - b.price)[0] : null;
      cityBest = [...pool].sort((a: any, b: any) => a.price - b.price)[0] ?? null;
    }

    // Log to search history if the caller is logged in — best-effort, never
    // fails the search itself if this insert has a problem. This is wrapped
    // in its own try/catch: previously an unguarded failure here (a stale
    // token, an Auth API hiccup, etc.) would throw all the way out to the
    // outer catch and turn a perfectly good search into a 500, which looked
    // to the user like "search worked once, then stopped returning results."
    if (authToken) {
      try {
        const { data: userData } = await supabase.auth.getUser(authToken);
        if (userData.user) {
          await supabase.from("search_history").insert({
            user_id: userData.user.id,
            query_text: text ?? structured.product_name,
            category: structured.category
          });
        }
      } catch (historyErr) {
        console.error("search_history logging failed (non-fatal)", historyErr);
      }
    }

    return NextResponse.json({
      query: structured,
      tier: tierUsed,
      local_results: results,
      web_estimate: webEstimate,
      near_best: nearBest,
      city_best: cityBest
    });
  } catch (err) {
    console.error("search error", err);
    return NextResponse.json({ error: "Search failed, please try again." }, { status: 500 });
  }
}
