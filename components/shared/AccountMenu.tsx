"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Clock, Settings as SettingsIcon, LogOut, LayoutDashboard, ClipboardList, Users, ShieldCheck, Search, Camera, Bell, Boxes, X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useAccount } from "@/lib/AccountProvider";

export function AccountMenu() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, storeName, storeLogoUrl, token, loading } = useAccount();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  async function confirmLogout() {
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
      <div className="flex gap-3 font-mono text-xs text-field/70">
        <Link href="/login" className="underline hover:text-field">{t("Log in")}</Link>
        <Link href="/signup" className="underline hover:text-field">{t("Sign up")}</Link>
        <Link href="/signup/merchant" className="underline hover:text-field">{t("Sell on PriceBook")}</Link>
      </div>
    );
  }

  const displayName = storeName || profile.full_name || profile.email;
  const initial = (storeName || profile.full_name || profile.email)[0]?.toUpperCase();

  return (
    <div className="flex h-full flex-col items-center text-center">
      <Link href="/" className="flex flex-col items-center">
        <img src="/pricebook-icon-dark.png" alt="PriceBook" className="h-auto w-28" />
      </Link>

      <div className="mt-4 flex flex-col items-center">
        {storeLogoUrl ? (
          <img src={storeLogoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-value font-display text-sm font-medium text-white">
            {initial}
          </span>
        )}
        <p className="mt-2 font-display text-[15px] font-semibold leading-tight text-field">{displayName}</p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-field/50">{profile.role}</p>
      </div>

      <nav className="mt-6 flex w-full flex-col gap-0.5 text-sm">
        {profile.role === "admin" ? (
          <>
            <Link href="/admin" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <LayoutDashboard size={16} strokeWidth={1.75} /> Admin dashboard
            </Link>
            <Link href="/admin/users" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <Users size={16} strokeWidth={1.75} /> Customers
            </Link>
            <Link href="/admin/stores" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <ShieldCheck size={16} strokeWidth={1.75} /> Stores and Shops
            </Link>
            <Link href="/admin/pending-stores" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <ClipboardList size={16} strokeWidth={1.75} /> Store requests
            </Link>
            <Link href="/admin/items" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <Boxes size={16} strokeWidth={1.75} /> Registered items
            </Link>
            <Link href="/admin/notifications" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <Bell size={16} strokeWidth={1.75} /> Notifications
            </Link>
          </>
        ) : profile.role === "merchant" ? (
          <>
            <Link href="/overview" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <LayoutDashboard size={16} strokeWidth={1.75} /> {t("Overview")}
            </Link>
            <Link href="/inventory" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <Package size={16} strokeWidth={1.75} /> {t("Manage inventory")}
            </Link>
            <Link href="/registered-items" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <Boxes size={16} strokeWidth={1.75} /> {t("Registered items")}
            </Link>
            <Link href="/notifications" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <Bell size={16} strokeWidth={1.75} /> {t("Notifications")}
            </Link>
          </>
        ) : (
          <>
            <Link href="/check-price" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <Camera size={16} strokeWidth={1.75} /> {t("Check price")}
            </Link>
            <Link href="/search-items" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <Search size={16} strokeWidth={1.75} /> {t("Search items")}
            </Link>
            <Link href="/history" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
              <Clock size={16} strokeWidth={1.75} /> {t("Search history")}
            </Link>
          </>
        )}
        <Link href="/settings" className="flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-field/70 hover:bg-white/10 hover:text-field">
          <SettingsIcon size={16} strokeWidth={1.75} /> {t("Settings")}
        </Link>
      </nav>

      <button
        onClick={() => setConfirmingLogout(true)}
        className="mt-auto flex items-center justify-center gap-1.5 rounded-sm bg-red-600 px-4 py-2 font-mono text-[11px] font-medium text-white hover:bg-red-700"
      >
        <LogOut size={14} strokeWidth={2} /> {t("Log out")}
      </button>

      {confirmingLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="relative w-full max-w-sm rounded-lg bg-white p-6 text-left shadow-2xl">
            <button
              onClick={() => setConfirmingLogout(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-full p-1.5 text-ash hover:bg-field hover:text-ink"
            >
              <X size={18} strokeWidth={2} />
            </button>

            <h2 className="pr-8 font-display text-lg font-semibold text-ink">{t("Log out?")}</h2>
            <p className="mt-2 text-sm text-ash">{t("Are you sure you want to log out of your account?")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmingLogout(false)}
                className="rounded-sm bg-blue-600 px-4 py-2 font-display text-sm font-medium text-white hover:bg-blue-700"
              >
                {t("Discard")}
              </button>
              <button
                onClick={confirmLogout}
                className="rounded-sm bg-red-600 px-4 py-2 font-display text-sm font-medium text-white hover:bg-red-700"
              >
                {t("Log out")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
