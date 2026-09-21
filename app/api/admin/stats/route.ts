import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const [{ count: userCount }, { count: storeCount }, { count: itemCount }, { count: pendingCount }, { data: priceReports }] =
    await Promise.all([
      auth.supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "customer"),
      auth.supabase.from("stores").select("id", { count: "exact", head: true }).eq("verification_status", "approved"),
      auth.supabase.from("store_inventory").select("id", { count: "exact", head: true }),
      auth.supabase.from("stores").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
      auth.supabase.from("price_reports").select("report_type")
    ]);

  const stores = storeCount ?? 0;
  const items = itemCount ?? 0;
  const avgItemsPerStore = stores > 0 ? Math.round((items / stores) * 10) / 10 : 0;

  // Positive = shopper confirmed the price was correct; negative = they
  // flagged it as wrong. This is the site's real price-trust signal —
  // the separate 1-5 star review system exists but sees no real usage.
  const reportRows = priceReports ?? [];
  const positiveReports = reportRows.filter((r) => r.report_type === "correct_price").length;
  const negativeReports = reportRows.filter((r) => r.report_type === "wrong_price").length;
  const totalReports = reportRows.length;
  const positivePct = totalReports ? Math.round((positiveReports / totalReports) * 1000) / 10 : 0;
  const negativePct = totalReports ? Math.round((negativeReports / totalReports) * 1000) / 10 : 0;

  return NextResponse.json({
    user_count: userCount ?? 0,
    store_count: stores,
    item_count: items,
    avg_items_per_store: avgItemsPerStore,
    pending_store_count: pendingCount ?? 0,
    positive_review_count: positiveReports,
    positive_review_pct: positivePct,
    negative_review_count: negativeReports,
    negative_review_pct: negativePct
  });
}
