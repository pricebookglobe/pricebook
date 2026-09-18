"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";

export default function MerchantSignup() {
  const router = useRouter();
  const [form, setForm] = useState({
    commercialName: "",
    commercialRegistration: "",
    address: "",
    city: "",
    email: "",
    password: ""
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    // If email confirmation is off in Supabase Auth settings, we get a
    // session immediately and can create the store right away. If it's on,
    // send them to confirm first — /store-profile picks up the rest after
    // they log in (see app/(merchant)/store-profile/page.tsx).
    if (!data.session) {
      router.push("/login?next=/store-profile&justSignedUp=1");
      return;
    }

    const res = await fetch("/api/merchant/store", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`
      },
      body: JSON.stringify({
        name: form.commercialName,
        commercial_registration: form.commercialRegistration,
        address: form.address,
        city: form.city,
        lat: coords.lat,
        lng: coords.lng
      })
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Could not create your store profile.");
      setBusy(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <PageShell maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">Register your store</h1>
      <p className="mt-1 text-center text-sm text-ash">Manage your prices and see how you rank nearby.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <label className="text-sm text-ash">
          Commercial name
          <input
            required
            value={form.commercialName}
            onChange={(e) => update("commercialName", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
          />
        </label>
        <label className="text-sm text-ash">
          Commercial registration number
          <input
            required
            value={form.commercialRegistration}
            onChange={(e) => update("commercialRegistration", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
          />
        </label>
        <label className="text-sm text-ash">
          Address
          <input
            required
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
          />
        </label>
        <label className="text-sm text-ash">
          City
          <input
            required
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
          />
        </label>

        <div className="rounded border border-line bg-field-raised px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ash">Store location</span>
            <button
              type="button"
              onClick={captureLocation}
              className="rounded-sm bg-ink px-2 py-1 font-display text-xs font-medium text-field"
            >
              {locating ? "Locating…" : coords ? "Update" : "Use my location"}
            </button>
          </div>
          {coords && (
            <p className="mt-1 font-mono text-xs text-value">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} ✓ captured
            </p>
          )}
        </div>

        <label className="text-sm text-ash">
          Email
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
          />
        </label>
        <label className="text-sm text-ash">
          Password
          <input
            required
            minLength={8}
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
          />
        </label>

        {error && <p className="text-sm text-flag">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-sm bg-ink px-4 py-2 font-display text-sm font-medium text-field disabled:opacity-40"
        >
          {busy ? "Setting up…" : "Register store"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ash">
        Just here to shop?{" "}
        <a href="/signup/customer" className="underline text-ink">
          Sign up as a customer
        </a>
      </p>
    </PageShell>
  );
}
