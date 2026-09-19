import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data: user, error: fetchError } = await auth.supabase
    .from("users")
    .select("email")
    .eq("id", params.id)
    .single();
  if (fetchError || !user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Reuses the same reset-password email flow a user would trigger
  // themselves from /forgot-password — the admin isn't handed a raw
  // password to set, they just prompt a real reset link to be sent.
  const { error } = await auth.supabase.auth.resetPasswordForEmail(user.email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
