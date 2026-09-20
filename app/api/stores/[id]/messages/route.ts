import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Log in to message a store" }, { status: 401 });

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { subject, message } = await req.json();
  if (!subject || !message) return NextResponse.json({ error: "subject and message are required" }, { status: 400 });

  const { error } = await supabase.from("store_messages").insert({
    store_id: params.id,
    from_user_id: userData.user.id,
    subject,
    message
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Merchant reads their own store's messages.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("id", params.id)
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!store) return NextResponse.json({ error: "Not your store" }, { status: 403 });

  const { data, error } = await supabase
    .from("store_messages")
    .select("id, subject, message, is_read, created_at")
    .eq("store_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
