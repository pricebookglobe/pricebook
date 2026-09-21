"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/shared/PageShell";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useAccount } from "@/lib/AccountProvider";

// Logged-out visitors land here — a sign-in screen, not the search tool.
// Nothing about checking or tracking prices is shown until authenticated.
function SignedOutHome() {
  const router = useRouter();
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
    router.refresh();
  }

  return (
    <PageShell maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Log in")}</h1>

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
          className="mt-1 rounded-sm bg-value px-4 py-2.5 font-display text-sm font-medium text-white hover:bg-value/90 disabled:opacity-40"
        >
          {busy ? t("Logging in…") : t("Log in")}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-ash underline hover:text-ink">
          {t("Forgot password?")}
        </Link>
        <Link href="/signup" className="text-ink underline hover:text-value">
          {t("Sign up")}
        </Link>
      </div>
    </PageShell>
  );
}

export default function Page() {
  const router = useRouter();
  const { profile, loading } = useAccount();

  useEffect(() => {
    // Each role's home is somewhere else — visiting "/" is effectively
    // "take me home", not a page in its own right for a logged-in person.
    if (loading) return;
    if (profile?.role === "admin") router.replace("/admin");
    else if (profile?.role === "merchant") router.replace("/overview");
    else if (profile?.role === "customer") router.replace("/check-price");
  }, [loading, profile, router]);

  if (loading) return null;
  if (!profile) return <SignedOutHome />;
  return null; // redirecting
}
