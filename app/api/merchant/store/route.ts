import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { data: store, error } = await supabase
    .from("stores")
    .select("id, name, city, address, commercial_registration")
    .eq("owner_id", userData.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(store); // null if the merchant hasn't finished setup yet
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createServiceSupabase();

  // Verify the token identifies a real, current user before trusting anything else in the body.
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { name, commercial_registration, address, city, lat, lng } = await req.json();
  if (!name || !commercial_registration || !address || !city || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "Missing required store fields" }, { status: 400 });
  }

  const { data: store, error: insertError } = await supabase
    .from("stores")
    .insert({
      owner_id: userData.user.id,
      name,
      commercial_registration,
      address,
      city,
      location: `SRID=4326;POINT(${lng} ${lat})`
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Make sure this account is flagged as a merchant even if the signup
  // trigger defaulted it to 'customer' (e.g. Google/OAuth signups later).
  await supabase.from("users").update({ role: "merchant" }).eq("id", userData.user.id);

  return NextResponse.json({ store_id: store.id });
}
