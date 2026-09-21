"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type Profile = { full_name: string | null; email: string; role: "customer" | "merchant" | "admin"; delete_history_on_logout: boolean };
type StoreDetails = {
  id: string;
  name: string;
  logo_url: string | null;
  store_photo_url: string | null;
  cr_certificate_url: string | null;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreDetails | null>(null);
  const [storeName, setStoreName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [crFile, setCrFile] = useState<File | null>(null);
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
      const storeData = await storeRes.json().catch(() => null);
      if (storeData) {
        setStoreId(storeData.id);
        setStore(storeData);
        setStoreName(storeData.name ?? "");
      }
    });
  }, [router]);

  async function handleSave() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    setSaved(null);

    const supabase = createBrowserSupabase();

    // Re-authentication is only needed when actually changing the email or
    // password — requiring it for every save (store name, logo, privacy
    // toggle, etc.) meant leaving it blank silently failed the whole save
    // with "Current password is incorrect," even when nothing about the
    // login itself was being touched.
    const changingCredentials = email !== profile.email || !!newPassword;
    if (changingCredentials) {
      if (!currentPassword) {
        setError(t("Enter your current password to change your email or password."));
        setBusy(false);
        return;
      }
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPassword });
      if (reauthError) {
        setError(t("Current password is incorrect."));
        setBusy(false);
        return;
      }
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

    // Store name, logo, front photo, and CR certificate — all optional,
    // only sent if the merchant actually changed or picked something.
    if (profile.role === "merchant" && storeId) {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (storeName.trim() && storeName.trim() !== store?.name) {
        await fetch("/api/merchant/store", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ name: storeName.trim() })
        });
      }

      if (logoFile || photoFile || crFile) {
        const [logoBase64, photoBase64, crBase64] = await Promise.all([
          logoFile ? fileToBase64(logoFile) : Promise.resolve(undefined),
          photoFile ? fileToBase64(photoFile) : Promise.resolve(undefined),
          crFile ? fileToBase64(crFile) : Promise.resolve(undefined)
        ]);
        await fetch("/api/merchant/store/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            store_id: storeId,
            store_logo_base64: logoBase64,
            store_photo_base64: photoBase64,
            cr_certificate_base64: crBase64,
            notify_admin: false
          })
        });
        setLogoFile(null);
        setPhotoFile(null);
        setCrFile(null);
      }
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

      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="mt-6 flex flex-col gap-3">
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
          {t("Current password")} <span className="text-ash/70">(only needed if changing email or password)</span>
          <div className="mt-1 flex items-center rounded border border-line bg-field">
            <input
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
        <p className="text-sm text-red-600">
          {t("Leave both password fields blank if you're not changing your email or password.")}
        </p>

        {error && <p className="text-sm text-flag">{error}</p>}
        {saved && <p className="text-sm text-value">{saved}</p>}
      </form>

      {profile.role === "merchant" && store && (
        <div className="mt-6 flex flex-col gap-3 rounded border border-line bg-field p-4">
          <p className="text-sm font-medium text-ink">{t("Store details")}</p>

          <label className="text-sm text-ash">
            {t("Store name")}
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
            />
          </label>

          <label className="text-sm text-ash">
            {t("Store logo")}
            {store.logo_url && (
              <img src={store.logo_url} alt="" className="mt-1 h-12 w-12 rounded-full border border-line object-cover" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-ink"
            />
          </label>

          <label className="text-sm text-ash">
            {t("Store front photo")}
            {store.store_photo_url && (
              <img src={store.store_photo_url} alt="" className="mt-1 h-20 w-full rounded border border-line object-cover" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-ink"
            />
          </label>

          <label className="text-sm text-ash">
            {t("CR certificate")}
            <p className="mt-1 font-mono text-[11px] text-ash">
              {store.cr_certificate_url ? t("A certificate is currently on file.") : t("No certificate on file.")}
            </p>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setCrFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-ink"
            />
            <p className="mt-1 font-mono text-[11px] text-ash/70">
              {t("Replacing this sends it for admin review again before it's approved.")}
            </p>
          </label>
        </div>
      )}

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

      <button
        onClick={handleSave}
        disabled={busy}
        className="mt-6 w-full rounded-sm bg-value px-4 py-2 font-display text-sm font-medium text-white hover:bg-value/90 disabled:opacity-40"
      >
        {busy ? t("Saving…") : t("Save changes")}
      </button>
    </AppPage>
  );
}
