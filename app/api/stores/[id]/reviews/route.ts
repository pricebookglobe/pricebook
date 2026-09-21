import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at") // no user_id/email — identity hidden from other customers
    .eq("store_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const avg = data.length ? data.reduce((sum, r) => sum + r.rating, 0) / data.length : null;

  // Positive/negative split for the trust star on the store page: 4-5
  // stars counts as positive, 1-2 as negative, 3 is neutral (counted in
  // the total but not either side). The percentage is positive as a share
  // of all reviews, which is what the star color thresholds are based on.
  const positive_count = data.filter((r) => r.rating >= 4).length;
  const negative_count = data.filter((r) => r.rating <= 2).length;
  const neutral_count = data.length - positive_count - negative_count;
  const positive_pct = data.length ? Math.round((positive_count / data.length) * 1000) / 10 : null;

  return NextResponse.json({
    reviews: data,
    average_rating: avg,
    count: data.length,
    positive_count,
    negative_count,
    neutral_count,
    positive_pct
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Log in to leave a review" }, { status: 401 });

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { rating, comment } = await req.json();
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating must be 1-5" }, { status: 400 });
  }

  const { error } = await supabase
    .from("reviews")
    .upsert(
      { store_id: params.id, user_id: userData.user.id, rating, comment: comment ?? null },
      { onConflict: "store_id,user_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
