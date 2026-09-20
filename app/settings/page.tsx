"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type Profile = { full_name: string | null; email: string; role: "customer" | "merchant" | "admin"; delete_history_on_logout: boolean };

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [deleteOnLogout, setDeleteOnLogout] = useState(false);
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
      const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      if (res.ok) {
        const p: Profile = await res.json();
        setProfile(p);
        setFullName(p.full_name ?? "");
        setEmail(p.email);
        setDeleteOnLogout(p.delete_history_on_logout);
      }
      const storeRes = await fetch("/api/merchant/store", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const store = await storeRes.json().catch(() => null);
      if (store) setStoreId(store.id);
    });
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    setSaved(null);

    const supabase = createBrowserSupabase();
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPassword });
    if (reauthError) {
      setError(t("Current password is incorrect."));
      setBusy(false);
      return;
    }

    const updates: { email?: string; password?: string; data?: { full_name: string } } = {};
    if (email !== profile.email) updates.email = email;
    if (newPassword) updates.password = newPassword;
    if (profile.role !== "merchant" && fullName !== (profile.full_name ?? "")) {
      updates.data = { full_name: fullName };
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase.auth.updateUser(updates);
      if (updateError) {
        setError(updateError.message);
        setBusy(false);
        return;
      }
      if (updates.data) {
        const { data: userData } = await supabase.auth.getUser();
        await supabase.from("users").update({ full_name: fullName }).eq("id", userData.user?.id);
      }
    }

    // Merchant's contact-person name lives on the store row, not the user row.
    if (profile.role === "merchant" && storeId && fullName) {
      const { data: sessionData } = await supabase.auth.getSession();
      await fetch("/api/merchant/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ contact_person_name: fullName })
      });
    }

    await supabase.from("users").update({ delete_history_on_logout: deleteOnLogout }).eq("id", (await supabase.auth.getUser()).data.user?.id);

    setCurrentPassword("");
    setNewPassword("");
    setBusy(false);
    setSaved(updates.email ? t("Saved. Check your new email address to confirm the change.") : t("Saved."));
  }

  if (!profile) return null;

  return (
    <AppPage maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Settings")}</h1>
      <p className="mt-1 text-center text-sm text-ash">
        {profile.role === "merchant" ? t("Merchants can update their email.") : t("Update your name or email.")}
      </p>

      <form onSubmit={handleSave} className="mt-6 flex flex-col gap-3">
        <label className="text-sm text-ash">
          {profile.role === "merchant" ? "Contact person name" : t("Full name")}
          <input value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none" />
        </label>

        <label className="text-sm text-ash">
          {t("Email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none" />
        </label>

        <label className="text-sm text-ash">
          New password <span className="text-ash/70">(leave blank to keep current)</span>
          <div className="mt-1 flex items-center rounded border border-line bg-field">
            <input
              type={showNewPassword ? "text" : "password"}
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-transparent px-3 py-2 text-ink outline-none"
            />
            <button type="button" onClick={() => setShowNewPassword((s) => !s)} className="px-3 text-ash hover:text-ink" aria-label="Toggle password visibility">
              {showNewPassword ? "🙈" : "👁"}
            </button>
          </div>
        </label>

        <label className="text-sm text-ash">
          {t("Current password")} <span className="text-ash/70">(required to save changes)</span>
          <div className="mt-1 flex items-center rounded border border-line bg-field">
            <input
              required
              type={showCurrentPassword ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-transparent px-3 py-2 text-ink outline-none"
            />
            <button type="button" onClick={() => setShowCurrentPassword((s) => !s)} className="px-3 text-ash hover:text-ink" aria-label="Toggle password visibility">
              {showCurrentPassword ? "🙈" : "👁"}
            </button>
          </div>
        </label>

        {error && <p className="text-sm text-flag">{error}</p>}
        {saved && <p className="text-sm text-value">{saved}</p>}

        <button type="submit" disabled={busy}
          className="mt-1 rounded-sm bg-ink px-4 py-2 font-display text-sm font-medium text-field disabled:opacity-40">
          {busy ? t("Saving…") : t("Save changes")}
        </button>
      </form>

      <div className="mt-6 rounded border border-line bg-field p-4">
        <p className="text-sm font-medium text-ink">Privacy</p>
        <label className="mt-2 flex items-center gap-2 text-sm text-ash">
          <input type="checkbox" checked={deleteOnLogout} onChange={(e) => setDeleteOnLogout(e.target.checked)} />
          Delete search history on logout
        </label>
        <p className="mt-1 font-mono text-[11px] text-ash">
          {deleteOnLogout ? "Your history clears on every logout." : "Your history is kept for up to a year."}
        </p>
      </div>
    </AppPage>
  );
}
