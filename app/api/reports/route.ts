import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Log in to report a price" }, { status: 401 });

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { store_id, product_id, report_type } = await req.json();
  if (!store_id || !product_id || !["correct_price", "wrong_price"].includes(report_type)) {
    return NextResponse.json({ error: "store_id, product_id and a valid report_type are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("price_reports")
    .upsert(
      { store_id, product_id, user_id: userData.user.id, report_type, updated_at: new Date().toISOString() },
      { onConflict: "store_id,product_id,user_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
