import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("stores")
    .select(
      "id, owner_id, name, address, city, commercial_registration, contact_person_name, admin_email, cr_certificate_url, store_photo_url, logo_url, verification_status, created_at, owner:users!stores_owner_id_fkey(is_frozen)"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The embedded owner relationship comes back as an object (or array,
  // depending on PostgREST's inference) — normalize it to a flat boolean
  // so the frontend doesn't have to guess the shape.
  const normalized = (data ?? []).map((s: any) => ({
    ...s,
    owner_is_frozen: Array.isArray(s.owner) ? s.owner[0]?.is_frozen ?? false : s.owner?.is_frozen ?? false
  }));

  return NextResponse.json(normalized);
}
