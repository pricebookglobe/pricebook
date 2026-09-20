import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { status } = await req.json();
  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  // Fetch the store first — a rejection needs its name/email for the
  // notification, and needs to happen before the row itself is removed.
  const { data: store, error: fetchError } = await auth.supabase
    .from("stores")
    .select("name, admin_email, owner_id")
    .eq("id", params.id)
    .single();
  if (fetchError || !store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  if (status === "rejected") {
    // A rejected registration is removed outright rather than kept around
    // in "rejected" status — the merchant is notified and can re-apply
    // with corrected details if they choose to.
    const { error: deleteError } = await auth.supabase.from("stores").delete().eq("id", params.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (store.admin_email) {
      await sendEmail({
        to: store.admin_email,
        subject: `Your PriceBook store registration wasn't approved`,
        html: `
          <p>Hi,</p>
          <p>We reviewed the registration for <strong>${store.name}</strong> and weren't able to approve it at this time.</p>
          <p>You're welcome to sign up again with corrected details, or reply to this email if you have questions.</p>
        `
      });
    }

    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await auth.supabase.from("stores").update({ verification_status: "approved" }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (store.admin_email) {
    await sendEmail({
      to: store.admin_email,
      subject: `${store.name} is approved on PriceBook!`,
      html: `
        <p>Hi,</p>
        <p>Good news — <strong>${store.name}</strong> is approved and live on PriceBook. You can log in and start adding items now.</p>
      `
    });
  }

  return NextResponse.json({ ok: true });
}
