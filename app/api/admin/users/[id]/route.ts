import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  if (params.id === auth.adminId) {
    return NextResponse.json({ error: "You can't delete your own admin account from here." }, { status: 400 });
  }

  // Delete the auth identity first (this is what actually stops the person
  // signing in), then the public.users row — deleting the row cascades to
  // everything that references it (stores, reviews, search_history, etc.),
  // since those foreign keys were declared "on delete cascade".
  const { error: authError } = await auth.supabase.auth.admin.deleteUser(params.id);
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  const { error: dbError } = await auth.supabase.from("users").delete().eq("id", params.id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
