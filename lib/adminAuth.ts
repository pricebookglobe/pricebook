import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "./supabaseClient";

/**
 * Verifies the caller is logged in AND has role='admin'. Every /api/admin/*
 * route should call this first — it's the one place that guards the whole
 * admin surface, so a bug here would be a bug everywhere, which is the
 * point: one path to audit instead of N copies of the same check.
 */
export async function requireAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const supabase = createServiceSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  }

  return { supabase, adminId: userData.user.id };
}
