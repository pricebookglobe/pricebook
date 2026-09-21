import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data: stores, error } = await auth.supabase
    .from("stores")
    .select(
      "id, owner_id, name, address, city, commercial_registration, contact_person_name, admin_email, cr_certificate_url, store_photo_url, logo_url, verification_status, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!stores || stores.length === 0) return NextResponse.json([]);

  // A separate plain query instead of an embedded join — a join needs the
  // exact foreign-key constraint name, and getting that even slightly
  // wrong fails the whole request (which is exactly what happened here:
  // stores and store-requests both went blank together, since they share
  // this route). Two simple queries merged in JS sidesteps that entirely.
  const ownerIds = [...new Set(stores.map((s) => s.owner_id))];
  const { data: owners, error: ownersError } = await auth.supabase
    .from("users")
    .select("id, is_frozen")
    .in("id", ownerIds);

  if (ownersError) return NextResponse.json({ error: ownersError.message }, { status: 500 });

  const frozenById = new Map((owners ?? []).map((u) => [u.id, u.is_frozen]));

  // Coordinates for the "View on map" action — location is a PostGIS
  // geography column Postgrest can't select coordinates out of directly,
  // so pull each one via the same RPC Settings already uses.
  const coordsByStore = new Map<string, { lat: number; lng: number } | null>();
  await Promise.all(
    stores.map(async (s) => {
      const { data: coords } = await auth.supabase.rpc("store_coordinates", { p_store_id: s.id });
      const row = coords?.[0];
      coordsByStore.set(s.id, row && row.lat != null ? { lat: row.lat, lng: row.lng } : null);
    })
  );

  const normalized = stores.map((s) => ({
    ...s,
    owner_is_frozen: frozenById.get(s.owner_id) ?? false,
    lat: coordsByStore.get(s.id)?.lat ?? null,
    lng: coordsByStore.get(s.id)?.lng ?? null
  }));

  return NextResponse.json(normalized);
}
