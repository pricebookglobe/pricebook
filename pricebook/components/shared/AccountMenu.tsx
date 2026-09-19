"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type Profile = { full_name: string | null; email: string; role: "customer" | "merchant" | "admin" };

export function AccountMenu() {
  const router = useRouter();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setLoading(false);
        return;
      }
      setToken(data.session.access_token);
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      if (res.ok) {
        const p: Profile = await res.json();
        setProfile(p);
        if (p.role === "merchant") {
          const storeRes = await fetch("/api/merchant/store", {
            headers: { Authorization: `Bearer ${data.session.access_token}` }
          });
          const store = await storeRes.json();
          if (store) setStoreName(store.name);
        }
      }
      setLoading(false);
    });
  }, []);

  async function handleLogout() {
    const supabase = createBrowserSupabase();

    // If the person opted into clearing history on every logout, do it
    // before the session token is gone.
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

  if (loading) return <div className="h-12 w-32" />;

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
    <div className="flex items-start gap-3">
      <a href="/">
        <img src="/pricebook-icon-transparent.png" alt="PriceBook" className="h-auto w-12" />
      </a>
      <div>
        <p className="mt-1 font-display text-sm font-medium text-ink">{displayName}</p>
        <div className="mt-1 flex items-center gap-2">
          <a href="/settings" aria-label={t("Settings")} className="text-ash hover:text-ink" title={t("Settings")}>
            ⚙︎
          </a>
          <button
            onClick={handleLogout}
            className="rounded-sm bg-red-50 px-2 py-0.5 font-mono text-[11px] font-medium text-red-600 hover:bg-red-100"
          >
            {t("Log out")}
          </button>
        </div>
      </div>
    </div>
  );
}
