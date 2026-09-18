"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";

type Profile = { full_name: string | null; email: string; role: "customer" | "merchant" | "admin" };

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/settings");
        return;
      }
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      if (res.ok) {
        const p: Profile = await res.json();
        setProfile(p);
        setFullName(p.full_name ?? "");
        setEmail(p.email);
      }
    });
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    setSaved(null);

    const supabase = createBrowserSupabase();

    // Re-confirm identity with the current password before changing
    // anything sensitive — required for both roles.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword
    });
    if (reauthError) {
      setError("Current password is incorrect.");
      setBusy(false);
      return;
    }

    const updates: { email?: string; data?: { full_name: string } } = {};
    if (email !== profile.email) updates.email = email;
    if (profile.role !== "merchant" && fullName !== (profile.full_name ?? "")) {
      updates.data = { full_name: fullName };
    }

    if (Object.keys(updates).length === 0) {
      setBusy(false);
      setSaved("Nothing to update.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser(updates);
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }

    // Keep public.users in sync for the name (email syncs via the auth
    // webhook/trigger pattern in a fuller build — for now, name only).
    if (updates.data) {
      await supabase.from("users").update({ full_name: fullName }).eq("id", (await supabase.auth.getUser()).data.user?.id);
    }

    setCurrentPassword("");
    setBusy(false);
    setSaved(
      updates.email
        ? "Saved. Check your new email address to confirm the change."
        : "Saved."
    );
  }

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (!profile) return null;

  return (
    <PageShell maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">Settings</h1>
      <p className="mt-1 text-center text-sm text-ash">
        {profile.role === "merchant" ? "Merchants can update their email." : "Update your name or email."}
      </p>

      <form onSubmit={handleSave} className="mt-6 flex flex-col gap-3">
        {profile.role !== "merchant" && (
          <label className="text-sm text-ash">
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
            />
          </label>
        )}

        <label className="text-sm text-ash">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
          />
        </label>

        <label className="text-sm text-ash">
          Current password <span className="text-ash/70">(required to save changes)</span>
          <input
            required
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
          />
        </label>

        {error && <p className="text-sm text-flag">{error}</p>}
        {saved && <p className="text-sm text-value">{saved}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-sm bg-ink px-4 py-2 font-display text-sm font-medium text-field disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>

      <button
        onClick={handleLogout}
        className="mt-6 w-full rounded-sm bg-red-50 px-4 py-2 font-display text-sm font-medium text-red-600 hover:bg-red-100"
      >
        Log out
      </button>
    </PageShell>
  );
}
