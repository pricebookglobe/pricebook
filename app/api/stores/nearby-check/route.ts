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

  // This repo's migrations are applied by hand, one at a time, in the
  // Supabase SQL editor (see README) — so the live find_nearest_store may
  // still be running an older signature than what this code assumes
  // (missing accuracy_m from 0027, or even missing store_photo_url /
  // store_lat / store_lng from 0025 / 0026). Calling an RPC with a named
  // parameter the live function doesn't have fails outright rather than
  // being ignored, so this falls back through progressively older
  // signatures instead of just erroring — a shopper gets the best match
  // the live database can actually provide, rather than "couldn't check
  // your location" because of a migration that hasn't been run yet.
  let data: any = null;
  let error: any = null;

  ({ data, error } = await supabase.rpc("find_nearest_store", {
    user_lat: lat,
    user_lng: lng,
    max_meters: 100,
    ...(accuracyM !== undefined ? { accuracy_m: accuracyM } : {})
  }));

  if (error && accuracyM !== undefined) {
    // Live function predates 0027 (no accuracy_m parameter) — retry
    // without it.
    ({ data, error } = await supabase.rpc("find_nearest_store", {
      user_lat: lat,
      user_lng: lng,
      max_meters: 100
    }));
  }

  if (error) {
    // Live function predates even 0026/0025 (no max_meters, or an
    // entirely different shape) — last resort, the original 2-argument
    // call every version of this function has supported since 0011.
    ({ data, error } = await supabase.rpc("find_nearest_store", {
      user_lat: lat,
      user_lng: lng
    }));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ store: data?.[0] ?? null });
}
