import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { extractProductFromImage, parseTextQuery, embedProductDescription } from "@/lib/aiVision";
import { webFallbackSearch } from "@/lib/webFallback";

const RADII_M = {
  immediate: 5_000,
  extended: 25_000,
  city: 60_000
} as const;

const SIMILARITY_FALLBACK_THRESHOLD = 0.75;

export async function POST(req: NextRequest) {
  const { text, imageBase64, lat, lng } = await req.json();

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }
  if (!text && !imageBase64) {
    return NextResponse.json({ error: "Provide text or imageBase64" }, { status: 400 });
  }

  try {
    // 1. Structured extraction — image takes priority when both are present.
    const structured = imageBase64
      ? await extractProductFromImage(imageBase64)
      : await parseTextQuery(text);

    // 2. Embed for semantic matching.
    const embedding = await embedProductDescription(structured);

    // 3. Widen the radius tier by tier until something turns up.
    const supabase = createServiceSupabase();
    let tierUsed: keyof typeof RADII_M | null = null;
    let results: any[] = [];

    for (const [tier, meters] of Object.entries(RADII_M) as [keyof typeof RADII_M, number][]) {
      const { data, error } = await supabase.rpc("search_nearby_products", {
        query_embedding: embedding,
        user_lat: lat,
        user_lng: lng,
        radius_meters: meters,
        match_limit: 30
      });
      if (error) throw error;
      if (data && data.length) {
        results = data;
        tierUsed = tier;
        break;
      }
    }

    // 4. Web fallback only when nothing local clears the similarity bar.
    const strongMatches = results.filter((r) => r.similarity > SIMILARITY_FALLBACK_THRESHOLD);
    const webEstimate = strongMatches.length ? null : await webFallbackSearch(structured);

    return NextResponse.json({
      query: structured,
      tier: tierUsed,
      local_results: results,
      web_estimate: webEstimate
    });
  } catch (err) {
    console.error("search error", err);
    return NextResponse.json({ error: "Search failed, please try again." }, { status: 500 });
  }
}
