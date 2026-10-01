import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  const { lat, lng } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  // 100m: close enough that a shopper standing at a store's entrance or
  // parking lot still matches, but tight enough that with several stores
  // registered in the same area, one that's actually a different store
  // down the street doesn't get claimed as "you're here." The RPC itself
  // already returns only the single nearest store within the radius, so a
  // crowded area naturally resolves to whichever one is actually closest.
  const { data, error } = await supabase.rpc("find_nearest_store", {
    user_lat: lat,
    user_lng: lng,
    max_meters: 100
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ store: data?.[0] ?? null });
}
