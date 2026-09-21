import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const [{ count: userCount }, { count: storeCount }, { count: itemCount }, { count: pendingCount }, { data: reviews }] =
    await Promise.all([
      auth.supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "customer"),
      auth.supabase.from("stores").select("id", { count: "exact", head: true }).eq("verification_status", "approved"),
      auth.supabase.from("store_inventory").select("id", { count: "exact", head: true }),
      auth.supabase.from("stores").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
      auth.supabase.from("reviews").select("rating")
    ]);

  const stores = storeCount ?? 0;
  const items = itemCount ?? 0;
  const avgItemsPerStore = stores > 0 ? Math.round((items / stores) * 10) / 10 : 0;

  // Same split used everywhere else reviews are summarized: 4-5 stars
  // positive, 1-2 negative, 3 neutral — platform-wide here rather than
  // per-store.
  const reviewRows = reviews ?? [];
  const positiveReviews = reviewRows.filter((r) => r.rating >= 4).length;
  const negativeReviews = reviewRows.filter((r) => r.rating <= 2).length;
  const totalReviews = reviewRows.length;
  const positivePct = totalReviews ? Math.round((positiveReviews / totalReviews) * 1000) / 10 : 0;
  const negativePct = totalReviews ? Math.round((negativeReviews / totalReviews) * 1000) / 10 : 0;

  return NextResponse.json({
    user_count: userCount ?? 0,
    store_count: stores,
    item_count: items,
    avg_items_per_store: avgItemsPerStore,
    pending_store_count: pendingCount ?? 0,
    positive_review_count: positiveReviews,
    positive_review_pct: positivePct,
    negative_review_count: negativeReviews,
    negative_review_pct: negativePct
  });
}
