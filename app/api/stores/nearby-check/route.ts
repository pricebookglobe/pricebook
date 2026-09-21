import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  const { lat, lng } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc("find_nearest_store", {
    user_lat: lat,
    user_lng: lng,
    max_meters: 10
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ store: data?.[0] ?? null });
}
