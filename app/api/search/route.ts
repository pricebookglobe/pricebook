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

    // When a photo doesn't clearly show a product (blurry, no product in
    // frame, an unusual angle), GPT-4o's vision extraction can come back
    // with an empty product_name rather than throwing — the request then
    // "succeeds" with nothing to actually search for, and the person just
    // sees a blank heading with no obvious explanation ("Snap returns
    // nothing"). Treat that the same as a real failure, with a message
    // that tells them what to try instead, rather than silently searching
    // for an empty string.
    if (!structured?.product_name || !String(structured.product_name).trim()) {
      return NextResponse.json(
        {
          error: imageBase64
            ? "Couldn't recognize a product in that photo — try a clearer, closer photo, or Enter details instead."
            : "Couldn't understand that search — try rephrasing, or Enter details instead."
        },
        { status: 422 }
      );
    }

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
    // Keyed by store + PRODUCT, not just store — a single store can
    // genuinely carry more than one item matching the search (e.g. both
    // "Snickers" and "Snickers Duo" for a "snick" search), and those are
    // different products that should both show up, not compete for one
    // slot per store. Keying by store_id alone silently dropped every
    // match but one per store; a store selling several matching items
    // would only ever show whichever one happened to be merged in last.
    function mergeByStoreAndProduct(...rowSets: any[][]): any[] {
      const byStoreProduct = new Map<string, any>();
      // Later sets win over earlier ones for the same store+product —
      // callers pass sets in ascending confidence order (weakest first).
      for (const rows of rowSets) {
        for (const row of rows) byStoreProduct.set(`${row.store_id}::${row.product_id}`, row);
      }
      return Array.from(byStoreProduct.values());
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

    // A single city-wide query is now the one source of truth for the
    // results list, rather than a tiered "try 5km, then 25km, then the
    // whole city, and STOP at whichever radius first finds anything."
    // That tiered approach was built back when the only thing to show was
    // one "closest option" — but once the whole point became a full
    // comparison table of every store carrying the item, stopping at the
    // first radius with a hit silently left out every farther store, even
    // genuinely matching ones (a store 6km away never made it into the
    // table just because a store 3km away happened to match first — it
    // only ever showed up in the separate "best price in the city" callout,
    // never in the list itself). Querying the full city radius once and
    // using it for everything means the table always reflects every real
    // match, at any distance.
    const { data: cityWideEmbedding, error: embeddingError } = await supabase.rpc("search_nearby_products", {
      query_embedding: embedding,
      user_lat: lat,
      user_lng: lng,
      radius_meters: RADII_M.city,
      match_limit: 100,
      query_size: structured.size ?? null,
      query_unit: structured.unit ?? null,
      min_similarity: SIMILARITY_FALLBACK_THRESHOLD
    });
    if (embeddingError) throw embeddingError;

    let cityWideText: any[] = [];
    if (partialTextQuery.length >= 2) {
      const { data, error: textError } = await supabase.rpc("search_nearby_products_by_text", {
        query_text: partialTextQuery,
        user_lat: lat,
        user_lng: lng,
        radius_meters: RADII_M.city,
        match_limit: 100
      });
      if (textError) throw textError;
      cityWideText = data ?? [];
    }

    let cityWideBarcode: any[] = [];
    if (barcode) {
      const { data, error: barcodeError } = await supabase.rpc("search_nearby_products_by_barcode", {
        target_barcode: barcode,
        user_lat: lat,
        user_lng: lng,
        radius_meters: RADII_M.city,
        match_limit: 100
      });
      if (barcodeError) throw barcodeError;
      cityWideBarcode = data ?? [];
    }

    // Priority (highest confidence wins for a given store+product):
    // embedding similarity < substring text match < exact barcode match.
    const cityWide = mergeByStoreAndProduct(cityWideEmbedding ?? [], cityWideText, cityWideBarcode);

    const strongMatches = cityWide.filter((r: any) => r.similarity > SIMILARITY_FALLBACK_THRESHOLD);
    const results = strongMatches.length ? strongMatches : cityWide;
    const webEstimate = strongMatches.length ? null : await webFallbackSearch(structured);

    // Purely a display label now ("neighborhood/town/city zone" in the
    // results header) — reflects how close the nearest real match is, but
    // no longer gates which results are included; that's what caused
    // farther-but-genuine matches to go missing.
    let tierUsed: keyof typeof RADII_M | null = null;
    if (results.length) {
      const closest = Math.min(...results.map((r: any) => r.distance_m));
      tierUsed = closest <= RADII_M.neighborhood ? "neighborhood" : closest <= RADII_M.town ? "town" : "city";
    }

    let nearBest: any = null;
    let cityBest: any = null;
    if (results.length) {
      const nearbyPool = results.filter((r: any) => r.distance_m <= RADII_M.neighborhood);
      nearBest = nearbyPool.length ? [...nearbyPool].sort((a: any, b: any) => a.price - b.price)[0] : null;
      cityBest = [...results].sort((a: any, b: any) => a.price - b.price)[0] ?? null;
    }

    // "Similar items" — other products in the same category (could be a
    // different size, brand, and/or manufacturer than what was searched),
    // not just other stores selling the exact same thing. Best-effort: a
    // failure here shouldn't turn a working exact-match search into a 500,
    // so this never throws past its own catch.
    let similarResults: any[] = [];
    try {
      const excludeIds = Array.from(new Set(cityWide.map((r: any) => r.product_id)));
      const { data: similarData, error: similarError } = await supabase.rpc("search_similar_products", {
        query_category: structured.category,
        user_lat: lat,
        user_lng: lng,
        radius_meters: RADII_M.city,
        match_limit: 50,
        exclude_product_ids: excludeIds
      });
      if (similarError) throw similarError;
      similarResults = similarData ?? [];
    } catch (similarErr) {
      console.error("search_similar_products failed (non-fatal)", similarErr);
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
      city_best: cityBest,
      similar_results: similarResults
    });
  } catch (err) {
    console.error("search error", err);
    return NextResponse.json({ error: "Search failed, please try again." }, { status: 500 });
  }
}
