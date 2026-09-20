import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const search = req.nextUrl.searchParams.get("search")?.trim();

  let query = auth.supabase
    .from("users")
    .select("id, email, full_name, first_name, last_name, role, is_frozen, created_at")
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .limit(200);

  if (search) {
    // Match on email or name — OR across a couple of columns via PostgREST's or() filter.
    query = query.or(
      `email.ilike.%${search}%,full_name.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
