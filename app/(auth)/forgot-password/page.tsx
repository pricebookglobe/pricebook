"use client";

import Link from "next/link";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    setSent(true);
    setBusy(false);
  }

  return (
    <PageShell maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Reset your password")}</h1>

      {sent ? (
        <p className="mt-6 text-center text-sm text-ash">
          {t("If an account exists for that email, a reset link is on its way. Check your inbox.")}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <label className="text-sm text-ash">
            {t("Email")} <span className="text-red-600">*</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2.5 text-[15px] text-ink outline-none focus:border-ink/40"
            />
          </label>

          {error && <p className="text-center text-sm text-flag">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-sm bg-value px-4 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-value/90 disabled:opacity-40"
          >
            {busy ? t("Sending…") : t("Send reset link")}
          </button>
        </form>
      )}

      <div className="mt-5 text-center text-sm">
        <Link href="/login" className="text-ash underline hover:text-ink">
          {t("Back to log in")}
        </Link>
      </div>
    </PageShell>
  );
}
