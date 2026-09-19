import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { store_id, cr_certificate_base64, store_photo_base64 } = await req.json();
  if (!store_id) return NextResponse.json({ error: "store_id is required" }, { status: 400 });

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("id", store_id)
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!store) return NextResponse.json({ error: "Not your store" }, { status: 403 });

  const updates: { cr_certificate_url?: string; store_photo_url?: string } = {};

  if (cr_certificate_base64) {
    const bytes = Buffer.from(cr_certificate_base64, "base64");
    const path = `${store_id}-cr-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("verification-documents")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("verification-documents").getPublicUrl(path);
      updates.cr_certificate_url = data.publicUrl; // bucket is private; URL only resolves for owner/admin, per storage policy
    }
  }

  if (store_photo_base64) {
    const bytes = Buffer.from(store_photo_base64, "base64");
    const path = `${store_id}-photo-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("store-photos")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("store-photos").getPublicUrl(path);
      updates.store_photo_url = data.publicUrl;
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("stores").update(updates).eq("id", store_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...updates });
}
