import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { sendEmail } from "@/lib/email";

const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "pricebook@institute-of-ai.org";

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
      // The bucket is private, so a plain public URL wouldn't actually open
      // for the admin — a signed URL (valid 30 days, plenty for a timely
      // review) is what makes the link in the admin panel and notification
      // email actually work.
      const { data } = await supabase.storage
        .from("verification-documents")
        .createSignedUrl(path, 60 * 60 * 24 * 30);
      if (data) updates.cr_certificate_url = data.signedUrl;
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

  // Notify the admin as soon as both documents are in — this is the last
  // step of merchant signup, so the store record is complete at this point
  // (name, registration number, contact, and now both attachments).
  const { data: fullStore } = await supabase
    .from("stores")
    .select("name, address, city, commercial_registration, contact_person_name, admin_email, cr_certificate_url, store_photo_url")
    .eq("id", store_id)
    .single();

  if (fullStore) {
    await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `New store pending verification: ${fullStore.name}`,
      html: `
        <h2>New store registration</h2>
        <p><strong>Store name:</strong> ${fullStore.name}</p>
        <p><strong>Address:</strong> ${fullStore.address}, ${fullStore.city}</p>
        <p><strong>Commercial registration #:</strong> ${fullStore.commercial_registration}</p>
        <p><strong>Contact person:</strong> ${fullStore.contact_person_name ?? "—"}</p>
        <p><strong>Store admin email:</strong> ${fullStore.admin_email ?? "—"}</p>
        <p><strong>CR certificate:</strong> ${fullStore.cr_certificate_url ? `<a href="${fullStore.cr_certificate_url}">View document</a>` : "not uploaded"}</p>
        <p><strong>Store photo:</strong> ${fullStore.store_photo_url ? `<a href="${fullStore.store_photo_url}">View photo</a>` : "not uploaded"}</p>
        <p>Review and approve at <a href="https://pricebook.institute-of-ai.org/admin/verify-stores">/admin/verify-stores</a>.</p>
      `
    });
  }

  return NextResponse.json({ ok: true, ...updates });
}
