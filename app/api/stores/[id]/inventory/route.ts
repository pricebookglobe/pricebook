import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

// Read fresh every time — this backs the report-count badge on Registered
// Items, which needs to reflect a just-submitted price report immediately.
export const dynamic = "force-dynamic";

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
    .select("id, price, currency, in_stock, is_hidden, updated_at, products ( id, canonical_name, brand, size, unit, category, image_url, nutrition_facts )")
    .eq("store_id", params.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json(data);

  // Price-report counts per item, for the "worst to best" sort and the
  // report-count badge on the Registered Items page — one query for all
  // of this store's reports, grouped in JS rather than a per-item request.
  const { data: reports } = await supabase
    .from("price_reports")
    .select("product_id, report_type")
    .eq("store_id", params.id);

  // How this store's price compares to every OTHER store selling the same
  // product — backs the "X% cheaper/pricier than other stores" badge on
  // the public store page. One query covering every product this store
  // carries, grouped in JS, rather than a per-item request; excludes this
  // store's own listing (comparing a price to itself is meaningless) and
  // any other store's out-of-stock/hidden listing (not a real price a
  // shopper could actually pay elsewhere right now).
  const productIds = Array.from(new Set(data.map((row: any) => row.products.id)));
  const marketAvgByProduct = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: marketRows } = await supabase
      .from("store_inventory")
      .select("product_id, price")
      .in("product_id", productIds)
      .neq("store_id", params.id)
      .eq("in_stock", true)
      .eq("is_hidden", false);
    const byProduct = new Map<string, number[]>();
    for (const row of marketRows ?? []) {
      const list = byProduct.get(row.product_id) ?? [];
      list.push(row.price);
      byProduct.set(row.product_id, list);
    }
    for (const [productId, prices] of byProduct) {
      marketAvgByProduct.set(productId, prices.reduce((a, b) => a + b, 0) / prices.length);
    }
  }

  const withReports = data.map((row: any) => {
    const rows = (reports ?? []).filter((r) => r.product_id === row.products.id);
    const positive = rows.filter((r) => r.report_type === "correct_price").length;
    const negative = rows.filter((r) => r.report_type === "wrong_price").length;
    const marketAvg = marketAvgByProduct.get(row.products.id) ?? null;
    // Positive = this store is cheaper than the market average by that many
    // percent; negative = pricier. Null when no other store carries it, so
    // the frontend can skip the badge entirely rather than show a
    // meaningless 0%/100%.
    const percentVsMarket = marketAvg ? Math.round(((marketAvg - row.price) / marketAvg) * 1000) / 10 : null;
    return {
      ...row,
      report_positive: positive,
      report_negative: negative,
      market_avg_price: marketAvg,
      percent_vs_market: percentVsMarket
    };
  });

  return NextResponse.json(withReports);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { product_id, price, in_stock, is_hidden, product_name, nutrition_facts } = await req.json();
  if (!product_id) return NextResponse.json({ error: "product_id is required" }, { status: 400 });

  const verified = await verifyOwnership(req, params.id);
  if (verified.error) return verified.error;
  const { supabase } = verified;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof price === "number") patch.price = price;
  if (typeof in_stock === "boolean") patch.in_stock = in_stock;
  if (typeof is_hidden === "boolean") patch.is_hidden = is_hidden;

  const { error } = await supabase
    .from("store_inventory")
    .update(patch)
    .eq("store_id", params.id)
    .eq("product_id", product_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (typeof price === "number") {
    await supabase.from("price_history").insert({ store_id: params.id, product_id, price });
  }

  // The product name lives on the shared `products` table, not this
  // store's own inventory row — products are matched and shown across
  // every store that lists the same item, so renaming it here corrects
  // (or changes) the name everywhere it appears, not just for this store.
  if (typeof product_name === "string" && product_name.trim()) {
    const { error: productError } = await supabase
      .from("products")
      .update({ canonical_name: product_name.trim() })
      .eq("id", product_id);
    if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  if (nutrition_facts !== undefined) {
    const { error: nutritionError } = await supabase
      .from("products")
      .update({ nutrition_facts })
      .eq("id", product_id);
    if (nutritionError) return NextResponse.json({ error: nutritionError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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
