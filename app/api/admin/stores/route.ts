import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

async function requireAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };

  const { data: profile } = await supabase.from("users").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };

  return { supabase };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("stores")
    .select("id, name, address, city, commercial_registration, contact_person_name, admin_email, cr_certificate_url, store_photo_url, verification_status, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
