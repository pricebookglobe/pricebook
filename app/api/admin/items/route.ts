import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data: inventory, error } = await auth.supabase
    .from("store_inventory")
    .select("id, price, currency, store_id, product_id, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!inventory || inventory.length === 0) return NextResponse.json([]);

  // Two plain queries instead of an embedded join — the same pattern used
  // by /api/admin/stores, since a join needs the exact foreign-key
  // constraint name and getting that wrong fails the whole request.
  const productIds = [...new Set(inventory.map((i) => i.product_id))];
  const storeIds = [...new Set(inventory.map((i) => i.store_id))];

  const [{ data: products, error: productsError }, { data: stores, error: storesError }] = await Promise.all([
    auth.supabase.from("products").select("id, canonical_name, brand, size, unit, image_url").in("id", productIds),
    auth.supabase.from("stores").select("id, name").in("id", storeIds)
  ]);

  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });
  if (storesError) return NextResponse.json({ error: storesError.message }, { status: 500 });

  // Coordinates for the "View store on map" action, same RPC used
  // elsewhere in admin — one call per distinct store, not per item.
  const coordsByStore = new Map<string, { lat: number; lng: number } | null>();
  await Promise.all(
    storeIds.map(async (id) => {
      const { data: coords } = await auth.supabase.rpc("store_coordinates", { p_store_id: id });
      const row = coords?.[0];
      coordsByStore.set(id, row && row.lat != null ? { lat: row.lat, lng: row.lng } : null);
    })
  );

  const productsById = new Map((products ?? []).map((p) => [p.id, p]));
  const storesById = new Map((stores ?? []).map((s) => [s.id, s]));

  const rows = inventory.map((i) => {
    const product = productsById.get(i.product_id);
    const store = storesById.get(i.store_id);
    const coords = coordsByStore.get(i.store_id);
    return {
      id: i.id,
      price: i.price,
      currency: i.currency,
      product_name: product?.canonical_name ?? "—",
      brand: product?.brand ?? null,
      size: product?.size ?? null,
      unit: product?.unit ?? null,
      image_url: product?.image_url ?? null,
      store_id: i.store_id,
      store_name: store?.name ?? "—",
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

  const { error } = await auth.supabase.from("store_inventory").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id, in_stock, is_hidden } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof in_stock === "boolean") patch.in_stock = in_stock;
  if (typeof is_hidden === "boolean") patch.is_hidden = is_hidden;

  const { error } = await auth.supabase.from("store_inventory").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
