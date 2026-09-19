"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Clock, Settings as SettingsIcon, LogOut, LayoutDashboard } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useAccount } from "@/lib/AccountProvider";

export function AccountMenu() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, storeName, storeLogoUrl, token, loading } = useAccount();

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

  // Only the very first load (before the root-level AccountProvider has
  // resolved) shows this placeholder — navigating between pages afterward
  // never hits this state again, since the context isn't re-fetched.
  if (loading) return <div className="h-52 w-32" />;

  if (!profile) {
    return (
      <div className="flex gap-3 font-mono text-xs text-ash">
        <Link href="/login" className="underline hover:text-ink">{t("Log in")}</Link>
        <Link href="/signup" className="underline hover:text-ink">{t("Sign up")}</Link>
        <Link href="/signup/merchant" className="underline hover:text-ink">{t("Sell on PriceBook")}</Link>
      </div>
    );
  }

  const displayName = storeName || profile.full_name || profile.email;
  const initial = (storeName || profile.full_name || profile.email)[0]?.toUpperCase();

  return (
    <div className="flex h-full flex-col items-center text-center">
      <Link href="/" className="flex flex-col items-center">
        <img src="/pricebook-icon-transparent.png" alt="PriceBook" className="h-auto w-16" />
      </Link>

      <div className="mt-4 flex flex-col items-center">
        {storeLogoUrl ? (
          <img src={storeLogoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-sm font-medium text-field">
            {initial}
          </span>
        )}
        <p className="mt-2 font-display text-[15px] font-semibold leading-tight text-ink">{displayName}</p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-ash">{profile.role}</p>
      </div>

      <nav className="mt-6 flex w-full flex-col gap-0.5 text-sm">
        {profile.role === "admin" ? (
          <Link href="/admin" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
            <LayoutDashboard size={16} strokeWidth={1.75} /> Admin platform
          </Link>
        ) : profile.role === "merchant" ? (
          <>
            <Link href="/overview" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
              <LayoutDashboard size={16} strokeWidth={1.75} /> Overview
            </Link>
            <Link href="/inventory" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
              <Package size={16} strokeWidth={1.75} /> {t("Products")}
            </Link>
          </>
        ) : (
          <Link href="/history" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
            <Clock size={16} strokeWidth={1.75} /> {t("Search history")}
          </Link>
        )}
        <Link href="/settings" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-ash hover:bg-field hover:text-ink">
          <SettingsIcon size={16} strokeWidth={1.75} /> {t("Settings")}
        </Link>
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
