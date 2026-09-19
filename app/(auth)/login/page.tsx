"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    router.push(params.get("next") ?? "/");
  }

  return (
    <PageShell maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Log in")}</h1>

      {params.get("justSignedUp") && (
        <p className="mt-4 rounded-sm bg-value-soft px-3 py-2 text-center text-sm text-value">
          {t("Check your email to confirm your account, then log in here.")}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input
          required
          type="email"
          value={email}
          placeholder={t("Email")}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-line bg-field px-3 py-2.5 text-[15px] text-ink placeholder:text-ash outline-none focus:border-ink/40"
        />
        <input
          required
          type="password"
          value={password}
          placeholder={t("Password")}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-line bg-field px-3 py-2.5 text-[15px] text-ink placeholder:text-ash outline-none focus:border-ink/40"
        />

        {error && <p className="text-center text-sm text-flag">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-sm bg-value px-4 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-value/90 disabled:opacity-40"
        >
          {busy ? t("Logging in…") : t("Log in")}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between text-sm">
        <a href="/forgot-password" className="text-ash underline hover:text-ink">
          {t("Forgot password?")}
        </a>
        <a href="/signup" className="text-ink underline hover:text-value">
          {t("Sign up")}
        </a>
      </div>
    </PageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
