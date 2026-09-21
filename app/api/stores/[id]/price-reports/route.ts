import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

// Public — same as /reviews, this is aggregate, non-identifying data
// shown on the store's public page. "Positive" here means a shopper
// confirmed the price was correct; "negative" means they flagged it as
// wrong. This is the site's real price-trust signal — the separate
// 1-5 star review system exists but sees no real usage, so this is what
// actually drives the trust indicator shown next to a store's name.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("price_reports")
    .select("report_type")
    .eq("store_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const count = data.length;
  const positive_count = data.filter((r) => r.report_type === "correct_price").length;
  const negative_count = data.filter((r) => r.report_type === "wrong_price").length;
  const positive_pct = count ? Math.round((positive_count / count) * 1000) / 10 : null;

  return NextResponse.json({ count, positive_count, negative_count, positive_pct });
}
