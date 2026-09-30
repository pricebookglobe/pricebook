import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

// Same reasoning as the overview route: this is read on every visit to the
// merchant's Notifications screen, and a stale cached response here would
// mean a real customer report silently never appears until some unrelated
// cache expiry — force a fresh read every time instead.
export const dynamic = "force-dynamic";

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

// The merchant's Notifications feed merges two kinds of events that
// previously lived on entirely separate screens: star reviews (unchanged,
// from store_review_notifications) and customer price-accuracy reports
// (from price_reports — the same table the Registered Items report badge
// and the Overview summary count both read from). A wrong-price report
// used to only ever surface as that badge; it now also shows up here,
// which is the actual notification a merchant would expect to see.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const verified = await verifyOwnership(req, params.id);
  if (verified.error) return verified.error;
  const { supabase } = verified;

  const { data: reviewRows, error: reviewError } = await supabase
    .from("store_review_notifications")
    .select("id, review_id, rating, created_at")
    .eq("store_id", params.id);
  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 500 });

  const { data: priceReportRows, error: priceError } = await supabase
    .from("price_reports")
    .select("id, report_type, created_at, products ( canonical_name, brand )")
    .eq("store_id", params.id);
  if (priceError) return NextResponse.json({ error: priceError.message }, { status: 500 });

  const reviews = (reviewRows ?? []).map((n) => ({
    type: "review" as const,
    id: n.id,
    rating: n.rating,
    created_at: n.created_at
  }));

  const priceReports = (priceReportRows ?? []).map((r: any) => ({
    type: "price_report" as const,
    id: r.id,
    report_type: r.report_type as "correct_price" | "wrong_price",
    product_name: r.products ? [r.products.brand, r.products.canonical_name].filter(Boolean).join(" ") : "",
    created_at: r.created_at
  }));

  const merged = [...reviews, ...priceReports].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json(merged);
}

// Dismisses (deletes) a notification only — the underlying review is
// untouched and stays visible to customers on the store's public page.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { notification_id } = await req.json();
  if (!notification_id) return NextResponse.json({ error: "notification_id is required" }, { status: 400 });

  const verified = await verifyOwnership(req, params.id);
  if (verified.error) return verified.error;
  const { supabase } = verified;

  const { error } = await supabase
    .from("store_review_notifications")
    .delete()
    .eq("store_id", params.id)
    .eq("id", notification_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
