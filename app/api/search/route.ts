import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { extractProductFromImage, parseTextQuery, embedProductDescription } from "@/lib/aiVision";
import { webFallbackSearch } from "@/lib/webFallback";

// "country" is an approximation (a large fixed radius), not a real
// border-aware query — good enough for an MVP, worth swapping for a
// country-code match on `stores` once that column exists.
const RADII_M = {
  neighborhood: 5_000,
  town: 25_000,
  country: 1_000_000
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
    const structured = imageBase64
      ? await extractProductFromImage(imageBase64)
      : await parseTextQuery(text);

    const embedding = await embedProductDescription(structured);

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
