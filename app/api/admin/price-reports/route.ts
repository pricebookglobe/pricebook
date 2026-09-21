import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data: reports, error } = await auth.supabase
    .from("price_reports")
    .select("id, store_id, product_id, report_type, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!reports || reports.length === 0) return NextResponse.json([]);

  const storeIds = [...new Set(reports.map((r) => r.store_id))];
  const productIds = [...new Set(reports.map((r) => r.product_id))];

  const [{ data: stores, error: storesError }, { data: products, error: productsError }] = await Promise.all([
    auth.supabase.from("stores").select("id, name").in("id", storeIds),
    auth.supabase.from("products").select("id, canonical_name, brand").in("id", productIds)
  ]);

  if (storesError) return NextResponse.json({ error: storesError.message }, { status: 500 });
  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });

  const coordsByStore = new Map<string, { lat: number; lng: number } | null>();
  await Promise.all(
    storeIds.map(async (id) => {
      const { data: coords } = await auth.supabase.rpc("store_coordinates", { p_store_id: id });
      const row = coords?.[0];
      coordsByStore.set(id, row && row.lat != null ? { lat: row.lat, lng: row.lng } : null);
    })
  );

  const storesById = new Map((stores ?? []).map((s) => [s.id, s]));
  const productsById = new Map((products ?? []).map((p) => [p.id, p]));

  const rows = reports.map((r) => {
    const store = storesById.get(r.store_id);
    const product = productsById.get(r.product_id);
    const coords = coordsByStore.get(r.store_id);
    return {
      id: r.id,
      report_type: r.report_type as "correct_price" | "wrong_price",
      created_at: r.created_at,
      store_id: r.store_id,
      store_name: store?.name ?? "—",
      product_name: product ? `${product.brand ? product.brand + " " : ""}${product.canonical_name}` : "—",
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null
    };
  });

  return NextResponse.json(rows);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await auth.supabase.from("price_reports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
