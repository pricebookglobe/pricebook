import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

async function authedUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

export async function GET(req: NextRequest) {
  const auth = await authedUser(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: store, error } = await auth.supabase
    .from("stores")
    .select(
      "id, name, city, address, commercial_registration, view_count, verification_status, logo_url, store_photo_url, cr_certificate_url, api_key"
    )
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store) return NextResponse.json(null);

  // `location` is a PostGIS geography point, not a plain column Postgrest
  // can select coordinates out of directly — pull them via a dedicated
  // RPC instead.
  const { data: coords } = await auth.supabase.rpc("store_coordinates", { p_store_id: store.id });
  return NextResponse.json({ ...store, lat: coords?.[0]?.lat ?? null, lng: coords?.[0]?.lng ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await authedUser(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { name, commercial_registration, address, city, lat, lng, contact_person_name, admin_email } = await req.json();
  if (!name || !commercial_registration || !address || !city || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "Missing required store fields" }, { status: 400 });
  }

  const { data: store, error: insertError } = await auth.supabase
    .from("stores")
    .insert({
      owner_id: auth.user.id,
      name,
      commercial_registration,
      address,
      city,
      contact_person_name: contact_person_name ?? null,
      admin_email: admin_email ?? auth.user.email,
      location: `SRID=4326;POINT(${lng} ${lat})`
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Make sure this account is flagged as a merchant even if the signup
  // trigger defaulted it to 'customer' — but never overwrite an existing
  // admin's role. Before this guard, an admin who ever tested the merchant
  // signup flow with their own account would silently lose admin access.
  const { data: existingProfile } = await auth.supabase.from("users").select("role").eq("id", auth.user.id).single();
  if (existingProfile?.role !== "admin") {
    await auth.supabase.from("users").update({ role: "merchant" }).eq("id", auth.user.id);
  }

  return NextResponse.json({ store_id: store.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await authedUser(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { contact_person_name, name, lat, lng } = await req.json();

  const patch: Record<string, unknown> = {};
  if (typeof contact_person_name === "string") patch.contact_person_name = contact_person_name;
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  if (typeof lat === "number" && typeof lng === "number") patch.location = `SRID=4326;POINT(${lng} ${lat})`;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await auth.supabase
    .from("stores")
    .update(patch)
    .eq("owner_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
