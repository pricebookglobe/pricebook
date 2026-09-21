import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { data: store } = await supabase
    .from("stores")
    .select("id, view_count")
    .eq("id", params.id)
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!store) return NextResponse.json({ error: "Not your store" }, { status: 403 });

  const { count: productCount } = await supabase
    .from("store_inventory")
    .select("id", { count: "exact", head: true })
    .eq("store_id", params.id);

  const { data: positions, error: posError } = await supabase.rpc("get_store_product_positions", {
    p_store_id: params.id
  });
  if (posError) return NextResponse.json({ error: posError.message }, { status: 500 });

  const overallPercentile = positions?.length
    ? Math.round((positions.reduce((sum: number, p: any) => sum + Number(p.percentile), 0) / positions.length) * 10) / 10
    : null;

  // Same positive/negative split used on the customer-facing store page:
  // 4-5 stars positive, 1-2 negative, 3 neutral.
  const { data: reviews } = await supabase.from("reviews").select("rating").eq("store_id", params.id);
  const reviewCount = reviews?.length ?? 0;
  const positiveReviews = reviews?.filter((r) => r.rating >= 4).length ?? 0;
  const negativeReviews = reviews?.filter((r) => r.rating <= 2).length ?? 0;

  return NextResponse.json({
    product_count: productCount ?? 0,
    view_count: store.view_count ?? 0,
    overall_percentile: overallPercentile, // lower = cheaper on average vs. town competitors
    products: positions ?? [],
    review_count: reviewCount,
    positive_reviews: positiveReviews,
    negative_reviews: negativeReviews
  });
}
