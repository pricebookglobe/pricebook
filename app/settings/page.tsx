"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useAccount } from "@/lib/AccountProvider";

type Profile = { full_name: string | null; email: string; role: "customer" | "merchant" | "admin"; delete_history_on_logout: boolean };
type StoreDetails = {
  id: string;
  name: string;
  logo_url: string | null;
  store_photo_url: string | null;
  cr_certificate_url: string | null;
  lat: number | null;
  lng: number | null;
  api_key: string | null;
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
  const { refresh: refreshAccount } = useAccount();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreDetails | null>(null);
  const [storeName, setStoreName] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
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
  const [showApiKey, setShowApiKey] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
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
        if (typeof storeData.lat === "number" && typeof storeData.lng === "number") {
          setCoords({ lat: storeData.lat, lng: storeData.lng });
        }
      }
    });
  }, [router]);

  function captureLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError(t("Couldn't read your location — allow location access and try again."));
        setLocating(false);
      }
    );
  }

  async function regenerateApiKey() {
    setRegeneratingKey(true);
    try {
      const supabase = createBrowserSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/merchant/store/api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` }
      });
      const data = await res.json();
      if (res.ok) setStore((s) => (s ? { ...s, api_key: data.api_key } : s));
    } finally {
      setRegeneratingKey(false);
    }
  }

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

      if (coords && (coords.lat !== store?.lat || coords.lng !== store?.lng)) {
        await fetch("/api/merchant/store", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ lat: coords.lat, lng: coords.lng })
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

    // Everything above updates the database directly — this page fetches
    // its own copy of the profile/store on mount, entirely separate from
    // the AccountProvider context that drives the sidebar (name, logo,
    // storeId). Without this, the sidebar keeps showing the old name/logo
    // until the next full page load, and re-fetch this tab out of it.
    refreshAccount();

    // Re-fetch this page's own copy too, so the store name/logo/CR status
    // shown here update immediately rather than waiting for a reload.
    if (storeId) {
      const { data: sessionData } = await supabase.auth.getSession();
      const freshStoreRes = await fetch("/api/merchant/store", {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` }
      });
      const freshStore = await freshStoreRes.json().catch(() => null);
      if (freshStore) {
        setStore(freshStore);
        setStoreName(freshStore.name ?? "");
      }
    }

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
          {t("Current password")}
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
        {!currentPassword && (
          <p className="text-sm text-amber-600">{t("Enter current password to save changes.")}</p>
        )}

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

          <div className="text-sm text-ash">
            {t("Store location")}
            <div className="mt-1 flex items-center justify-between rounded border border-line bg-field-raised px-3 py-2">
              <span className="font-mono text-xs text-ink">
                {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : t("Not set")}
              </span>
              <button
                type="button"
                onClick={captureLocation}
                disabled={locating}
                className="rounded-sm bg-ink px-2 py-1 font-display text-xs font-medium text-field transition-colors hover:bg-value hover:text-white disabled:opacity-40"
              >
                {locating ? "…" : coords ? t("Update") : t("Use my location")}
              </button>
            </div>
          </div>

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
              accept="image/*,application/pdf"
              onChange={(e) => setCrFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-ink"
            />
            <p className="mt-1 font-mono text-[11px] text-ash/70">
              {t("Replacing this sends it for admin review again before it's approved.")}
            </p>
          </label>
        </div>
      )}

      {profile.role === "merchant" && store && (
        <div className="mt-6 flex flex-col gap-3 rounded border border-line bg-field p-4">
          <p className="text-sm font-medium text-ink">{t("Store API")}</p>
          <p className="text-sm text-ash">
            {t("Connect your own POS or inventory system to automatically update your prices — see the")}{" "}
            <Link href="/docs/api" className="underline hover:text-ink">
              {t("API documentation")}
            </Link>
            .
          </p>
          <div className="text-sm text-ash">
            {t("Store ID")}
            <code className="ml-2 rounded border border-line bg-field-raised px-2 py-1 font-mono text-xs text-ink">{store.id}</code>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded border border-line bg-field-raised px-3 py-2 font-mono text-xs text-ink">
              {showApiKey ? store.api_key ?? "—" : "•".repeat(24)}
            </code>
            <button
              type="button"
              onClick={() => setShowApiKey((s) => !s)}
              className="rounded-sm border border-line px-3 py-1.5 font-display text-xs text-ink transition-colors hover:border-value hover:bg-value hover:text-white"
            >
              {showApiKey ? t("Hide") : t("Show")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (store.api_key) {
                  navigator.clipboard.writeText(store.api_key);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2000);
                }
              }}
              className="rounded-sm border border-line px-3 py-1.5 font-display text-xs text-ink transition-colors hover:border-value hover:bg-value hover:text-white"
            >
              {copiedKey ? t("Copied!") : t("Copy")}
            </button>
            <button
              type="button"
              onClick={regenerateApiKey}
              disabled={regeneratingKey}
              className="rounded-sm border border-line px-3 py-1.5 font-display text-xs text-flag transition-colors hover:bg-flag hover:text-white disabled:opacity-40"
            >
              {regeneratingKey ? "…" : t("Regenerate")}
            </button>
          </div>
          <p className="font-mono text-[11px] text-ash/70">
            {t("Regenerating immediately invalidates the old key — update anything using it right away.")}
          </p>
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
