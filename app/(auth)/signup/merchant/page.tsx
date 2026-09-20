"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";
import { AlreadySignedInNotice } from "@/components/shared/AlreadySignedInNotice";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useAccount } from "@/lib/AccountProvider";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function MerchantSignup() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, loading: accountLoading } = useAccount();
  const [form, setForm] = useState({
    commercialName: "",
    commercialRegistration: "",
    address: "",
    city: "",
    contactPersonName: "",
    email: "",
    password: ""
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [crFile, setCrFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [locating, setLocating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function captureLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Couldn't read your location — allow location access and try again.");
        setLocating(false);
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords) {
      setError("Set your store's location before continuing.");
      return;
    }
    if (!crFile || !photoFile) {
      setError("Upload both your CR certificate and a photo of the store.");
      return;
    }
    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.commercialName, role: "merchant" } }
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    // Same as the customer form — a duplicate email can come back as
    // "success" with no identities instead of an error, which previously
    // sent existing users down a confusing "check your email" path.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError("This email is already registered. Please log in instead.");
      setBusy(false);
      return;
    }

    if (!data.session) {
      // Should be unreachable once email confirmation is off in Supabase
      // (see README) — signUp() always returns a session immediately in
      // that case. This is a plain error instead of a redirect to any
      // "finish later" page, since that resume flow no longer exists.
      setError("Your account was created, but we couldn't sign you in automatically. Please try logging in.");
      setBusy(false);
      return;
    }

    const storeRes = await fetch("/api/merchant/store", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({
        name: form.commercialName,
        commercial_registration: form.commercialRegistration,
        address: form.address,
        city: form.city,
        contact_person_name: form.contactPersonName,
        admin_email: form.email,
        lat: coords.lat,
        lng: coords.lng
      })
    });

    if (!storeRes.ok) {
      const body = await storeRes.json();
      setError(body.error ?? "Could not create your store profile.");
      setBusy(false);
      return;
    }

    const { store_id } = await storeRes.json();

    const [crBase64, photoBase64, logoBase64] = await Promise.all([
      fileToBase64(crFile),
      fileToBase64(photoFile),
      logoFile ? fileToBase64(logoFile) : Promise.resolve(null)
    ]);
    await fetch("/api/merchant/store/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({
        store_id,
        cr_certificate_base64: crBase64,
        store_photo_base64: photoBase64,
        store_logo_base64: logoBase64 ?? undefined
      })
    });

    setBusy(false);
    setPendingReview(true);
  }

  if (pendingReview) {
    return (
      <PageShell maxWidth="max-w-sm">
        <h1 className="text-center font-display text-xl font-semibold text-ink">Thanks — almost there</h1>
        <p className="mt-3 text-center text-sm text-ash">
          Your store details are in. Our team will review your registration documents before your dashboard unlocks
          — we'll email you once you're approved.
        </p>
        <Link
          href="/login"
          className="mt-6 block rounded-sm bg-value px-4 py-2 text-center font-display text-sm font-medium text-white hover:bg-value/90"
        >
          {t("Go to log in")}
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="max-w-sm">
      <Link href="/login" className="mb-4 inline-block text-sm text-ash underline hover:text-ink">
        ← {t("Back to log in")}
      </Link>
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Register your store")}</h1>
      <p className="mt-1 text-center text-sm text-ash">{t("Manage your prices and see how you rank nearby.")}</p>

      {!accountLoading && profile && (
        <div className="mt-6">
          <AlreadySignedInNotice email={profile.email} displayName={profile.full_name || profile.email} />
        </div>
      )}

      {!accountLoading && !profile && (
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <label className="text-sm text-ash">
          {t("Commercial name")} <span className="text-red-600">*</span>
          <input required value={form.commercialName} onChange={(e) => update("commercialName", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none" />
        </label>
        <label className="text-sm text-ash">
          {t("Commercial registration number")} <span className="text-red-600">*</span>
          <input required value={form.commercialRegistration} onChange={(e) => update("commercialRegistration", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none" />
        </label>
        <label className="text-sm text-ash">
          Upload CR certificate <span className="text-red-600">*</span>
          <input required type="file" accept="image/*,.pdf" onChange={(e) => setCrFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-ink" />
        </label>
        <label className="text-sm text-ash">
          {t("Address")} <span className="text-red-600">*</span>
          <input required value={form.address} onChange={(e) => update("address", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none" />
        </label>
        <label className="text-sm text-ash">
          {t("City")} <span className="text-red-600">*</span>
          <input required value={form.city} onChange={(e) => update("city", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none" />
        </label>

        <div className="rounded border border-line bg-field px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ash">{t("Store location")} <span className="text-red-600">*</span></span>
            <button type="button" onClick={captureLocation}
              className="rounded-sm bg-ink px-2 py-1 font-display text-xs font-medium text-field">
              {locating ? "…" : coords ? t("Update") : t("Use my location")}
            </button>
          </div>
          {coords && <p className="mt-1 font-mono text-xs text-value">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} ✓</p>}
        </div>

        <label className="text-sm text-ash">
          Photo of the store (front / location) <span className="text-red-600">*</span>
          <input required type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-ink" />
        </label>

        <label className="text-sm text-ash">
          Store logo <span className="text-ash/70">(optional — shown in your dashboard sidebar)</span>
          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-ink" />
        </label>

        <label className="text-sm text-ash">
          Contact person's name <span className="text-red-600">*</span>
          <input required value={form.contactPersonName} onChange={(e) => update("contactPersonName", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none" />
        </label>
        <label className="text-sm text-ash">
          Store admin email <span className="text-red-600">*</span>
          <input required type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none" />
        </label>
        <label className="text-sm text-ash">
          {t("Password")} <span className="text-red-600">*</span>
          <div className="mt-1 flex items-center rounded border border-line bg-field">
            <input required minLength={8} type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => update("password", e.target.value)}
              className="w-full bg-transparent px-3 py-2 text-ink outline-none" />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="px-3 text-ash hover:text-ink" aria-label="Toggle password visibility">
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
        </label>

        {error && <p className="text-sm text-flag">{error}</p>}

        <button type="submit" disabled={busy}
          className="mt-2 rounded-sm bg-value px-4 py-2 font-display text-sm font-medium text-white hover:bg-value/90 disabled:opacity-40">
          {busy ? t("Setting up…") : t("Register your store")}
        </button>
      </form>
      )}
    </PageShell>
  );
}
