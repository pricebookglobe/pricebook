import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

async function verifyOwnership(req: NextRequest, storeId: string) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("owner_id", userData.user.id)
    .maybeSingle();

  if (storeError) return { error: NextResponse.json({ error: storeError.message }, { status: 500 }) };
  if (!store) return { error: NextResponse.json({ error: "Not your store" }, { status: 403 }) };

  return { supabase };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const verified = await verifyOwnership(req, params.id);
  if (verified.error) return verified.error;
  const { supabase } = verified;

  const { data, error } = await supabase
    .from("store_review_notifications")
    .select("id, review_id, rating, created_at")
    .eq("store_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Dismisses (deletes) a notification only — the underlying review is
// untouched and stays visible to customers on the store's public page.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { notification_id } = await req.json();
  if (!notification_id) return NextResponse.json({ error: "notification_id is required" }, { status: 400 });

  const verified = await verifyOwnership(req, params.id);
  if (verified.error) return verified.error;
  const { supabase } = verified;

  const { error } = await supabase
    .from("store_review_notifications")
    .delete()
    .eq("store_id", params.id)
    .eq("id", notification_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
