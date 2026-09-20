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
  const normalized = stores.map((s) => ({ ...s, owner_is_frozen: frozenById.get(s.owner_id) ?? false }));

  return NextResponse.json(normalized);
}
