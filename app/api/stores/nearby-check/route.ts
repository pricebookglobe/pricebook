import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  const { lat, lng, accuracy } = await req.json();
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
  //
  // accuracy_m is the device's own reported GPS accuracy, when the caller
  // has one — the RPC uses it to tell two close-together stores apart with
  // confidence (returning no match rather than a guess when it can't).
  // Capped at 5m even when the device reports a much looser fix (ordinary
  // phone GPS is routinely 15-50m, especially indoors or in a city
  // street): using that raw, looser number as the disambiguation radius
  // was too aggressive and started throwing away perfectly good matches
  // in any area with two stores anywhere near each other — the real cause
  // of the storefront photo "disappearing" (no match at all means no
  // store, no photo, just the map). 5m is enough to separate two stores
  // that aren't right on top of each other, which is all this is for.
  const accuracyM = typeof accuracy === "number" && Number.isFinite(accuracy) ? Math.min(Math.max(accuracy, 1), 5) : undefined;

  const { data, error } = await supabase.rpc("find_nearest_store", {
    user_lat: lat,
    user_lng: lng,
    max_meters: 100,
    ...(accuracyM !== undefined ? { accuracy_m: accuracyM } : {})
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ store: data?.[0] ?? null });
}
