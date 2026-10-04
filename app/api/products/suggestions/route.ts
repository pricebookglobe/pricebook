import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

// Lightweight typeahead for FreeTextSearch — as the shopper types, this
// returns the handful of registered products whose name/brand contains
// what they've typed so far, each with its own photo, so they can pick the
// exact item (e.g. distinguishing "Milk Chocolate Bar" from "Milk 1L" for a
// "milk" search) before the full AI-parsed search even runs. No auth, no
// location — see migration 0032's own comment for why this is kept
// deliberately simpler than the real search endpoint.
export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (typeof text !== "string" || text.trim().length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc("search_product_suggestions", {
    query_text: text.trim(),
    match_limit: 8
  });

  if (error) {
    // A database that hasn't run migration 0032 yet (function doesn't
    // exist) shouldn't break the search box itself — the dropdown just
    // never appears, same as if nothing matched.
    console.error("product suggestions error", error);
    return NextResponse.json({ suggestions: [] });
  }

  return NextResponse.json({ suggestions: data ?? [] });
}
