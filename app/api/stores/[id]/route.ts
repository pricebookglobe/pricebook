import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceSupabase();

  // ST_Y/ST_X pull lat/lng back out of the geography column for display.
  const { data, error } = await supabase.rpc("get_store_public_info", { p_store_id: params.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data[0]);
}
