"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function CustomerSignup() {
  const router = useRouter();
  const { t } = useLanguage();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    address: "",
    city: "",
    country: "",
    password: "",
    confirmPassword: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          role: "customer",
          first_name: form.firstName,
          last_name: form.lastName,
          full_name: `${form.firstName} ${form.lastName}`.trim(),
          address: form.address,
          city: form.city,
          country: form.country
        }
      }
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    router.push("/");
  }

  return (
    <PageShell maxWidth="max-w-sm">
      <a href="/login" className="mb-4 inline-block text-sm text-ash underline hover:text-ink">
        ← {t("Back to log in")}
      </a>
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Create your account")}</h1>
      <p className="mt-1 text-center text-sm text-ash">{t("Find the best local prices, saved to your name.")}</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-ash">
            First name
            <input
              required
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
            />
          </label>
          <label className="text-sm text-ash">
            Surname
            <input
              required
              value={form.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
            />
          </label>
        </div>
        <label className="text-sm text-ash">
          {t("Email")}
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
          />
        </label>
        <label className="text-sm text-ash">
          {t("Address")}
          <input
            required
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-ash">
            {t("City")}
            <input
              required
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
            />
          </label>
          <label className="text-sm text-ash">
            Country
            <input
              required
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
            />
          </label>
        </div>

        <label className="text-sm text-ash">
          {t("Password")}
          <div className="mt-1 flex items-center rounded border border-line bg-field">
            <input
              required
              minLength={8}
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className="w-full bg-transparent px-3 py-2 text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="px-3 text-ash hover:text-ink"
              aria-label="Toggle password visibility"
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
        </label>
        <label className="text-sm text-ash">
          Confirm password
          <div className="mt-1 flex items-center rounded border border-line bg-field">
            <input
              required
              type={showPassword ? "text" : "password"}
              value={form.confirmPassword}
              onChange={(e) => update("confirmPassword", e.target.value)}
              className="w-full bg-transparent px-3 py-2 text-ink outline-none"
            />
          </div>
        </label>

        {error && <p className="text-sm text-flag">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-sm bg-ink px-4 py-2 font-display text-sm font-medium text-field disabled:opacity-40"
        >
          {busy ? t("Creating…") : t("Create your account")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ash">
        {t("Own a store instead?")}{" "}
        <a href="/signup/merchant" className="underline text-ink">
          {t("Sign up as a store admin")}
        </a>
      </p>
    </PageShell>
  );
}
