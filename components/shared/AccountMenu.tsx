"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type Profile = {
  full_name: string | null;
  email: string;
  role: "customer" | "merchant" | "admin";
  delete_history_on_logout: boolean;
};

export function AccountMenu() {
  const router = useRouter();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(async ({ data: userData, error: userError }) => {
      if (userError || !userData.user) {
        setLoading(false);
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setLoading(false);
        return;
      }
      setToken(accessToken);
      const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const p: Profile = await res.json();
        setProfile(p);
        if (p.role === "merchant") {
          const storeRes = await fetch("/api/merchant/store", { headers: { Authorization: `Bearer ${accessToken}` } });
          const store = await storeRes.json();
          if (store) setStoreName(store.name);
        }
      }
      setLoading(false);
    });
  }, []);

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    if (token) {
      try {
        const meRes = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.delete_history_on_logout) {
            await fetch("/api/history", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
          }
        }
      } catch {
        // best-effort — never block logout on this
      }
    }
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) return <div className="h-40 w-32" />; // avoid layout shift while checking session

  if (!profile) {
    return (
      <div className="flex gap-3 font-mono text-xs text-ash">
        <a href="/login" className="underline hover:text-ink">{t("Log in")}</a>
        <a href="/signup" className="underline hover:text-ink">{t("Sign up")}</a>
        <a href="/signup/merchant" className="underline hover:text-ink">{t("Sell on PriceBook")}</a>
      </div>
    );
  }

  const displayName = storeName || profile.full_name || profile.email;

  return (
    <div>
      <a href="/">
        <img src="/pricebook-icon-transparent.png" alt="PriceBook" className="h-auto w-24" />
      </a>
      <p className="mt-2 font-display text-base font-semibold text-ink">{displayName}</p>

      <nav className="mt-3 flex flex-col items-start gap-2 text-sm">
        <a href="/settings" className="flex items-center gap-1.5 text-ash hover:text-ink">
          <span aria-hidden>⚙︎</span> {t("Settings")}
        </a>
        {profile.role === "merchant" ? (
          <a href="/inventory" className="flex items-center gap-1.5 text-ash hover:text-ink">
            <span aria-hidden>📦</span> {t("Products")}
          </a>
        ) : (
          <a href="/history" className="flex items-center gap-1.5 text-ash hover:text-ink">
            <span aria-hidden>🕘</span> {t("Search history")}
          </a>
        )}
      </nav>

      <button
        onClick={handleLogout}
        className="mt-3 rounded-sm bg-red-600 px-3 py-1.5 font-mono text-[11px] font-medium text-white hover:bg-red-700"
      >
        {t("Log out")}
      </button>
    </div>
  );
}
