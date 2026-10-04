import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  const { lat, lng, accuracy } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  // 20m: close enough to comfortably cover standing at a store's entrance
  // or just outside it, but — per 0030 — tight enough that in a row of
  // several closely-packed storefronts (reported case: ~10 stores, each
  // only ~5m wide, side by side) it no longer sweeps in half the block.
  // The RPC always returns the single nearest active store within this
  // radius now (0030 dropped the old ambiguity veto that used to refuse to
  // answer at all whenever two stores were close together, which was
  // firing constantly in a dense row and showing as "unregistered
  // location" even while standing right at a real, registered store).
  //
  // accuracy_m is still passed through for signature compatibility with a
  // database that hasn't run migration 0030 yet (see the fallback below),
  // but 0030's version of the function no longer uses it.
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
    max_meters: 20,
    ...(accuracyM !== undefined ? { accuracy_m: accuracyM } : {})
  }));

  if (error && accuracyM !== undefined) {
    // Live function predates 0027 (no accuracy_m parameter) — retry
    // without it.
    ({ data, error } = await supabase.rpc("find_nearest_store", {
      user_lat: lat,
      user_lng: lng,
      max_meters: 20
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
