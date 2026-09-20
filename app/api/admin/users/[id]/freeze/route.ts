import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { frozen } = await req.json();
  if (typeof frozen !== "boolean") {
    return NextResponse.json({ error: "frozen (boolean) is required" }, { status: 400 });
  }

  // ban_duration is Supabase Auth's real, server-enforced lock — GoTrue
  // refuses logins for a banned user on its own, this isn't just a cosmetic
  // flag. "none" clears the ban; a long duration stands in for "indefinite"
  // since the Admin API doesn't accept a literal "forever".
  const { error: authError } = await auth.supabase.auth.admin.updateUserById(params.id, {
    ban_duration: frozen ? "876000h" : "none"
  });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  const { error: dbError } = await auth.supabase.from("users").update({ is_frozen: frozen }).eq("id", params.id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
