"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Clock, Settings as SettingsIcon, LogOut, Users, ShieldCheck } from "lucide-react";
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

  if (loading) return <div className="h-52 w-32" />; // avoid layout shift while checking session

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
  const initial = (storeName || profile.full_name || profile.email)[0]?.toUpperCase();

  return (
    <div className="flex h-full flex-col items-center text-center">
      <a href="/" className="flex flex-col items-center">
        <img src="/pricebook-icon-transparent.png" alt="PriceBook" className="h-auto w-16" />
      </a>

      <div className="mt-4 flex flex-col items-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-sm font-medium text-field">
          {initial}
        </span>
        <p className="mt-2 font-display text-[15px] font-semibold leading-tight text-ink">{displayName}</p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-ash">{profile.role}</p>
      </div>

      <nav className="mt-6 flex w-full flex-col gap-0.5 text-sm">
        {profile.role === "admin" ? (
          <>
            <a href="/admin/users" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
              <Users size={16} strokeWidth={1.75} /> Users
            </a>
            <a href="/admin/verify-stores" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
              <ShieldCheck size={16} strokeWidth={1.75} /> Stores
            </a>
          </>
        ) : profile.role === "merchant" ? (
          <a href="/inventory" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
            <Package size={16} strokeWidth={1.75} /> {t("Products")}
          </a>
        ) : (
          <a href="/history" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
            <Clock size={16} strokeWidth={1.75} /> {t("Search history")}
          </a>
        )}
        <a href="/settings" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
          <SettingsIcon size={16} strokeWidth={1.75} /> {t("Settings")}
        </a>
      </nav>

      <button
        onClick={handleLogout}
        className="mt-auto flex items-center justify-center gap-1.5 rounded-sm bg-red-600 px-4 py-2 font-mono text-[11px] font-medium text-white hover:bg-red-700"
      >
        <LogOut size={14} strokeWidth={2} /> {t("Log out")}
      </button>
    </div>
  );
}
