import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { extractProductFromImage, parseTextQuery, embedProductDescription } from "@/lib/aiVision";
import { webFallbackSearch } from "@/lib/webFallback";
import { withUnitPrice } from "@/lib/unitPrice";
import { namesMatch } from "@/lib/nameMatch";
import { displayProductName } from "@/lib/productName";
import { normalizeUnit } from "@/lib/units";

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
    const cityWideMerged = mergeByStoreAndProduct(cityWideEmbedding ?? [], cityWideText, cityWideBarcode);

    // Name gate, applied once here rather than trusting each individual
    // source to have already filtered correctly: the embedding search
    // compares *meaning*, so a generic query like "Ultra Drinking Water"
    // can land well above the exact-match similarity floor against a
    // totally different brand — "San Pellegrino Sparkling Natural Mineral
    // Water" — just because both are, semantically, about bottled water.
    // The text search is meant to be stricter (see
    // search_nearby_products_by_text), but re-checking here means a real
    // mismatch can't slip into the main results table even if that SQL
    // function is ever out of sync with this logic. A barcode match is
    // exempt — scanning a specific barcode already identifies the exact
    // product beyond any doubt, regardless of how differently its name
    // happens to be typed. Anything that fails this still gets a chance to
    // show up under "Similar items" via search_similar_products below.
    //
    // Folds brand into the name on BOTH sides before comparing (same
    // displayProductName() the UI uses to show "Ultra Bottled Drinking
    // Water" as one heading) rather than comparing structured.product_name
    // alone — GPT's photo/barcode extraction often splits the brand out
    // into its own field ({ product_name: "Bottled Drinking Water", brand:
    // "Ultra" }) instead of folding it into product_name the way text
    // search queries do. Comparing product_name alone meant the query side
    // of the check was effectively just "water" every time, which is why
    // every other water brand kept passing.
    const queryName = displayProductName(structured.brand, structured.product_name ?? "");
    const barcodeKeys = new Set(cityWideBarcode.map((r: any) => `${r.store_id}::${r.product_id}`));
    const isNameMatch = (r: any) =>
      barcodeKeys.has(`${r.store_id}::${r.product_id}`) ||
      namesMatch(displayProductName(r.brand, r.product_name ?? ""), queryName);
    const cityWide = cityWideMerged.filter(isNameMatch);
    // Everything that scored well enough to have been a match (by text or
    // embedding) but failed the name check — i.e. genuinely the same
    // category/type, just not the same product — is exactly what "Similar
    // items" is supposed to show (see search_similar_products below, which
    // only covers the lower 0.6–0.75 embedding band; this covers the
    // ≥0.75/text-matched band that the name gate just rejected).
    const sameCategoryDifferentItem = cityWideMerged.filter((r: any) => !isNameMatch(r));

    const strongMatches = cityWide.filter((r: any) => r.similarity > SIMILARITY_FALLBACK_THRESHOLD);
    // unit_price (price per gram/ml/cm/item, pack size included) backs every
    // ranking below — a fuzzy match can span several genuinely different
    // pack sizes/sizes under one product name, and raw listing price alone
    // would unfairly favor the smaller pack every time. The real listing
    // price is still what's returned and shown to the shopper; unit_price is
    // for comparison only. See lib/unitPrice.ts.
    const results = (strongMatches.length ? strongMatches : cityWide).map(withUnitPrice);
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
      // `results` can span several genuinely different pack sizes/sizes
      // under the one matched product name (a single bar and its 6-pack,
      // say) — picking "best" by unit_price alone across ALL of them used
      // to let a 6-pack's much lower per-gram price get surfaced as "the
      // best price nearby" for someone who scanned a single bar, which
      // isn't a real comparison (same reasoning sameItem()/nameMatch.ts
      // already apply to the Save badges). When the query names a
      // concrete size (a photo scan, a barcode, or a structured
      // category-picker submission all do), the best-price picks are
      // restricted to listings with that SAME size/unit/pack_size. A
      // vague text search with no concrete size has nothing to restrict
      // to, so every size/pack variant stays eligible there, same as before.
      const querySize = structured.size ?? null;
      const queryUnit = normalizeUnit(structured.unit) ?? null;
      const queryPackSize = structured.pack_size ?? 1;
      const hasQuerySku = querySize != null && queryUnit != null;
      const skuMatches = (r: any) =>
        Number(r.size) === Number(querySize) &&
        normalizeUnit(r.unit) === queryUnit &&
        (r.pack_size ?? 1) === queryPackSize;

      const nearbyPool = results.filter((r: any) => r.distance_m <= RADII_M.neighborhood);
      const nearbyEligible = hasQuerySku ? nearbyPool.filter(skuMatches) : nearbyPool;
      const cityEligible = hasQuerySku ? results.filter(skuMatches) : results;

      nearBest = nearbyEligible.length ? [...nearbyEligible].sort((a: any, b: any) => a.unit_price - b.unit_price)[0] : null;
      cityBest = cityEligible.length ? [...cityEligible].sort((a: any, b: any) => a.unit_price - b.unit_price)[0] : null;
    }

    // "Similar items" — other products that are semantically close to the
    // search (could be a different size, brand, and/or manufacturer), not
    // just other stores selling the exact same thing. Reuses the same
    // embedding already computed for the exact-match search above, just
    // with a lower similarity floor than SIMILARITY_FALLBACK_THRESHOLD —
    // products.category turned out to be free text set per-product
    // ("Snacks" vs "snacks" vs "Confectionery" vs "Candy Bar"), too
    // inconsistent to filter on directly (see migration 0035). Best-effort:
    // a failure here shouldn't turn a working exact-match search into a
    // 500, so this never throws past its own catch.
    //
    // min_similarity started at 0.35, which was too loose in practice —
    // "Mixed Nuts" showed up as "similar" to a Snickers search. Raised to
    // 0.6: still comfortably below the 0.75 exact-match floor (so it's
    // never just repeating local_results), but close enough to it that
    // what comes back reads as "other chocolate bars," not "other food."
    let similarResults: any[] = [];
    try {
      const excludeIds = Array.from(new Set(cityWide.map((r: any) => r.product_id)));
      const { data: similarData, error: similarError } = await supabase.rpc("search_similar_products", {
        query_embedding: embedding,
        user_lat: lat,
        user_lng: lng,
        radius_meters: RADII_M.city,
        match_limit: 50,
        min_similarity: 0.6,
        exclude_product_ids: excludeIds
      });
      if (similarError) throw similarError;
      // Merge in the same-category-different-item matches the name gate
      // rejected above — mergeByStoreAndProduct takes later sets as higher
      // confidence, so a real embedding-based similarity score (from the
      // RPC) wins over the rejected rows' own similarity field, which can
      // be a meaningless hardcoded 0.99 when the row came in via the text
      // match path rather than embeddings.
      similarResults = mergeByStoreAndProduct(sameCategoryDifferentItem, similarData ?? []).map(withUnitPrice);
    } catch (similarErr) {
      console.error("search_similar_products failed (non-fatal)", similarErr);
      similarResults = sameCategoryDifferentItem.map(withUnitPrice);
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
