"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    let settled = false;

    // Clicking the emailed link lands here with a recovery token in the
    // URL, which the Supabase client picks up automatically and turns
    // into a temporary "recovery" session — that's what actually lets
    // updateUser() below set a new password without knowing the old one.
    // If the link is missing, expired, or already used, no such session
    // ever appears, so we wait briefly for it rather than assuming success.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setReady(true);
      }
    });

    const timeout = setTimeout(() => {
      if (!settled) setInvalidLink(true);
    }, 3000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t("Passwords don't match."));
      return;
    }
    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // The recovery session becomes a real one the moment the password is
    // set, so there's no separate "now log in again" step.
    router.push("/");
  }

  return (
    <PageShell maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Set a new password")}</h1>

      {invalidLink ? (
        <div className="mt-6 text-center text-sm text-ash">
          <p>{t("This reset link is invalid or has expired.")}</p>
          <Link href="/forgot-password" className="mt-3 inline-block text-ink underline hover:text-value">
            {t("Request a new link")}
          </Link>
        </div>
      ) : !ready ? (
        <p className="mt-6 text-center text-sm text-ash">{t("Checking your link…")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <label className="text-sm text-ash">
            {t("New password")}
            <div className="mt-1 flex items-center rounded border border-line bg-field">
              <input
                required
                minLength={8}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none"
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
            {t("Confirm password")}
            <input
              required
              minLength={8}
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2.5 text-[15px] text-ink outline-none focus:border-ink/40"
            />
          </label>

          {error && <p className="text-center text-sm text-flag">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-sm bg-value px-4 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-value/90 disabled:opacity-40"
          >
            {busy ? t("Saving…") : t("Save new password")}
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
