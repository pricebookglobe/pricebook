import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const [{ count: userCount }, { count: storeCount }, { count: itemCount }, { count: pendingCount }] = await Promise.all([
    auth.supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "customer"),
    auth.supabase.from("stores").select("id", { count: "exact", head: true }),
    auth.supabase.from("store_inventory").select("id", { count: "exact", head: true }),
    auth.supabase.from("stores").select("id", { count: "exact", head: true }).eq("verification_status", "pending")
  ]);

  const stores = storeCount ?? 0;
  const items = itemCount ?? 0;
  const avgItemsPerStore = stores > 0 ? Math.round((items / stores) * 10) / 10 : 0;

  return NextResponse.json({
    user_count: userCount ?? 0,
    store_count: stores,
    item_count: items,
    avg_items_per_store: avgItemsPerStore,
    pending_store_count: pendingCount ?? 0
  });
}
