import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("stores")
    .select(
      "id, owner_id, name, description, address, city, commercial_registration, contact_person_name, admin_email, cr_certificate_url, store_photo_url, logo_url, verification_status, rating, rating_count, view_count, created_at, owner:owner_id(is_frozen)"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten the embedded owner row -- Supabase/PostgREST returns the FK
  // join as a nested object (or array, depending on relationship
  // cardinality inference); normalize both shapes to a single boolean so
  // the frontend doesn't need to know about the join at all.
  const normalized = (data ?? []).map((s: any) => ({
    ...s,
    is_frozen: Array.isArray(s.owner) ? !!s.owner[0]?.is_frozen : !!s.owner?.is_frozen,
    owner: undefined
  }));

  return NextResponse.json(normalized);
}
