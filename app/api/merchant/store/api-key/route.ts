import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { data: store } = await supabase.from("stores").select("id").eq("owner_id", userData.user.id).maybeSingle();
  if (!store) return NextResponse.json({ error: "No store on this account" }, { status: 404 });

  // Regenerating immediately invalidates the old key — anything still
  // using it (an old integration, a leaked key) stops working right away.
  const newKey = randomBytes(24).toString("hex");
  const { error } = await supabase.from("stores").update({ api_key: newKey }).eq("id", store.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ api_key: newKey });
}
