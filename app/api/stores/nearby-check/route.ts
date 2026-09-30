import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  const { lat, lng } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  // 150m, not a tighter radius: a phone's GPS/network fix is commonly off
  // by tens of meters, and a shopper standing at a large store's entrance
  // or parking lot can easily be 50-100m from the coordinate pinned for
  // that store. A too-small radius (this used to be 10m) means "you're at
  // the store" fails even when you plainly are. Matches AT_STORE_METERS,
  // the same threshold CheckPriceExperience already uses for search results.
  const { data, error } = await supabase.rpc("find_nearest_store", {
    user_lat: lat,
    user_lng: lng,
    max_meters: 150
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ store: data?.[0] ?? null });
}
