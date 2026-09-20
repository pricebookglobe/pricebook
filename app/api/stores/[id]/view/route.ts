import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceSupabase();
  const { error } = await supabase.rpc("increment_store_view", { p_store_id: params.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
