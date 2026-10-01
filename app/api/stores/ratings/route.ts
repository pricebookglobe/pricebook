import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

// Batched review-rating lookup for a list of stores at once. The
// check-price/search results list can show results from dozens of
// different stores on one screen — fetching each store's own
// /api/stores/[id]/reviews individually there would mean one request per
// row instead of one request for the whole list.
export async function POST(req: NextRequest) {
  const { store_ids } = await req.json();
  if (!Array.isArray(store_ids) || store_ids.length === 0) {
    return NextResponse.json({});
  }

  const ids = Array.from(new Set(store_ids.filter((id) => typeof id === "string"))).slice(0, 200);
  if (ids.length === 0) return NextResponse.json({});

  const supabase = createServiceSupabase();
  const { data, error } = await supabase.from("reviews").select("store_id, rating").in("store_id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byStore = new Map<string, number[]>();
  for (const row of data ?? []) {
    const list = byStore.get(row.store_id) ?? [];
    list.push(row.rating);
    byStore.set(row.store_id, list);
  }

  const result: Record<string, { average_rating: number | null; count: number }> = {};
  for (const id of ids) {
    const ratings = byStore.get(id) ?? [];
    result[id] = {
      average_rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
      count: ratings.length
    };
  }

  return NextResponse.json(result);
}
