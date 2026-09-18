import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

// Verifies the caller is logged in AND owns the store at params.id — the
// earlier version trusted the store_id in the URL with no auth check at
// all, which let anyone write to any store's inventory. Every write below
// now goes through this first.
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
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("store_inventory")
    .select("id, price, currency, in_stock, updated_at, products ( id, canonical_name, brand, size, unit, category, image_url )")
    .eq("store_id", params.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { product_id, price, currency = "JOD", in_stock = true } = await req.json();
  if (!product_id || typeof price !== "number") {
    return NextResponse.json({ error: "product_id and numeric price are required" }, { status: 400 });
  }

  const verified = await verifyOwnership(req, params.id);
  if (verified.error) return verified.error;
  const { supabase } = verified;

  const { error: invError } = await supabase
    .from("store_inventory")
    .upsert(
      { store_id: params.id, product_id, price, currency, in_stock, updated_at: new Date().toISOString() },
      { onConflict: "store_id,product_id" }
    );
  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

  const { error: histError } = await supabase
    .from("price_history")
    .insert({ store_id: params.id, product_id, price });
  if (histError) return NextResponse.json({ error: histError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { product_id } = await req.json();
  if (!product_id) return NextResponse.json({ error: "product_id is required" }, { status: 400 });

  const verified = await verifyOwnership(req, params.id);
  if (verified.error) return verified.error;
  const { supabase } = verified;

  const { error } = await supabase
    .from("store_inventory")
    .delete()
    .eq("store_id", params.id)
    .eq("product_id", product_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
