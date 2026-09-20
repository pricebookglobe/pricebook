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
  const { text, imageBase64, structured: preStructured, lat, lng } = await req.json();
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

    // Log to search history if the caller is logged in — best-effort, never
    // fails the search itself if this insert has a problem.
    if (authToken) {
      const { data: userData } = await supabase.auth.getUser(authToken);
      if (userData.user) {
        await supabase.from("search_history").insert({
          user_id: userData.user.id,
          query_text: text ?? structured.product_name,
          category: structured.category
        });
      }
    }

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
