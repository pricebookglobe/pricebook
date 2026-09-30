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

  // A logged-in shopper gets exactly one review per store (enforced by the
  // unique(store_id, user_id) constraint and the upsert in POST below). If
  // they're signed in, tell the frontend what their existing review is (if
  // any) so it can be shown/edited in place, rather than the page silently
  // implying a fresh review each visit while POST just overwrites the same
  // row. Reviewer identity still isn't exposed to anyone else — this is
  // returned only to the reviewer themself, based on their own token.
  let my_review: { id: string; rating: number; comment: string | null } | null = null;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const { data: userData } = await supabase.auth.getUser(token);
    if (userData?.user) {
      // Plain select + take the oldest, not .maybeSingle() — if this
      // account somehow already has more than one row for this store (from
      // before the dedup fix in POST below, or a database that's missing
      // the unique constraint 0024_reviews_unique_per_user.sql adds),
      // .maybeSingle() errors on >1 row and my_review would silently come
      // back null, hiding the problem instead of still letting the
      // reviewer see and edit their (oldest, canonical) review.
      const { data: mine } = await supabase
        .from("reviews")
        .select("id, rating, comment")
        .eq("store_id", params.id)
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      my_review = mine?.[0] ?? null;
    }
  }

  return NextResponse.json({
    reviews: data,
    average_rating: avg,
    count: data.length,
    positive_count,
    negative_count,
    neutral_count,
    positive_pct,
    my_review
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

  // Explicit look-up-then-write instead of a plain upsert(onConflict: ...).
  // upsert's ON CONFLICT only dedupes if a matching unique constraint
  // actually exists on (store_id, user_id) in the database — and that's
  // set up by a SQL migration (supabase/migrations) that has to be run
  // against the Supabase project separately from deploying this app, so
  // it's easy for it to silently never have been applied. When that
  // happens, ON CONFLICT has nothing to match and upsert just inserts a
  // fresh row every time — exactly the "every submit adds another review"
  // bug. This makes one-review-per-account correct at the application
  // layer regardless of whether that constraint made it into the database,
  // while 0024_reviews_unique_per_user.sql still adds (and enforces) it
  // there too, as the real backstop against races and any other write path.
  const { data: existing, error: lookupError } = await supabase
    .from("reviews")
    .select("id")
    .eq("store_id", params.id)
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  const { error } = existing
    ? await supabase.from("reviews").update({ rating, comment: comment ?? null }).eq("id", existing.id)
    : await supabase.from("reviews").insert({ store_id: params.id, user_id: userData.user.id, rating, comment: comment ?? null });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
