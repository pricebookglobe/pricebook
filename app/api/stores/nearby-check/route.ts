import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  const { lat, lng, accuracy } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  // 20m: close enough to comfortably cover standing at a store's entrance
  // or just outside it, but tight enough that in a row of several
  // closely-packed storefronts (reported case: ~10 stores, each only ~5m
  // wide, side by side) it no longer sweeps in half the block.
  //
  // accuracy_m is only used by the old single-store fallback chain below,
  // for a database that hasn't run migration 0031 yet.
  const accuracyM = typeof accuracy === "number" && Number.isFinite(accuracy) ? Math.min(Math.max(accuracy, 1), 5) : undefined;

  // This repo's migrations are applied by hand, one at a time, in the
  // Supabase SQL editor (see README) — so the live database may still be
  // missing recent functions/columns. Calling an RPC with a named parameter
  // or function name the live database doesn't have fails outright rather
  // than being ignored, so this falls back through progressively older
  // signatures instead of just erroring — a shopper gets the best match
  // the live database can actually provide, rather than "couldn't check
  // your location" because of a migration that hasn't been run yet.
  //
  // 0031 added find_nearby_stores, which returns every active store within
  // range (nearest first) instead of just the closest one — this is what
  // lets the UI show "You're at X — not right? pick a neighbor" instead of
  // silently committing to a single guess. Tried first; falls back to the
  // single-store find_nearest_store chain below for a database that hasn't
  // run 0031 yet, so a shopper still gets a best-guess match rather than
  // "couldn't check your location" because of a migration that hasn't been
  // applied.
  let stores: any[] | null = null;
  let error: any = null;

  ({ data: stores, error } = await supabase.rpc("find_nearby_stores", {
    user_lat: lat,
    user_lng: lng,
    max_meters: 20
  }));

  if (!error) {
    return NextResponse.json({ stores: stores ?? [], store: stores?.[0] ?? null });
  }

  // --- Fallback chain for a database still on 0030 or earlier: only ever
  // produces a single store, wrapped in a one-item list so the response
  // shape is the same either way. ---
  let data: any = null;

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
  const store = data?.[0] ?? null;
  return NextResponse.json({ stores: store ? [store] : [], store });
}
