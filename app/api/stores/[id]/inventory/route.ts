import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

// NOTE: this route uses the service-role client for simplicity in the MVP.
// Before shipping, switch to a request-scoped client built from the user's
// session token so Postgres RLS (see supabase/migrations/0001_init.sql)
// enforces store ownership itself, rather than trusting `params.id` alone.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("store_inventory")
    .select("id, price, in_stock, updated_at, products ( id, canonical_name, brand, size, unit, category )")
    .eq("store_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { product_id, price, currency = "JOD", in_stock = true } = await req.json();
  if (!product_id || typeof price !== "number") {
    return NextResponse.json({ error: "product_id and numeric price are required" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Upsert current state...
  const { error: invError } = await supabase
    .from("store_inventory")
    .upsert(
      { store_id: params.id, product_id, price, currency, in_stock, updated_at: new Date().toISOString() },
      { onConflict: "store_id,product_id" }
    );
  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

  // ...and append to the audit trail in the same request.
  const { error: histError } = await supabase
    .from("price_history")
    .insert({ store_id: params.id, product_id, price });
  if (histError) return NextResponse.json({ error: histError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
