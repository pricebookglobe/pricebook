"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Clock, Settings as SettingsIcon, LogOut, LayoutDashboard, ClipboardList, Users, ShieldCheck, Search, Camera, Bell, Boxes, X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useAccount } from "@/lib/AccountProvider";
import { onPendingStoresChanged } from "@/lib/pendingStoresEvents";
import { EmojiRating } from "./EmojiRating";

// Same price-report-trust coloring as the public store page: green above
// 90% positive, amber 75-90%, red below 75%, grey with nothing yet — a
// plain colored dot, separate from the face-emoji review rating next to it.
function trustCircleColor(positivePct: number | null): string {
  if (positivePct === null) return "bg-field/40";
  if (positivePct > 90) return "bg-value";
  if (positivePct >= 75) return "bg-flag";
  return "bg-red-500";
}

export function AccountMenu() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, storeName, storeId, storeLogoUrl, token, loading } = useAccount();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  // The merchant's own at-a-glance reputation — the same circle+face pair
  // shown on their public store page — surfaced beside the store name here
  // too, so it's visible from every merchant page via this shared sidebar,
  // not just the Overview dashboard.
  const [reviewStats, setReviewStats] = useState<{ average: number | null; count: number } | null>(null);
  const [positivePct, setPositivePct] = useState<number | null>(null);
  // Pending store signups awaiting approval — surfaced as a small badge
  // next to "Store requests" so an admin can see at a glance, from any
  // admin page, whether anything needs their attention.
  const [pendingStoreCount, setPendingStoreCount] = useState(0);

  useEffect(() => {
    if (!storeId || profile?.role !== "merchant") return;
    let cancelled = false;
    fetch(`/api/stores/${storeId}/reviews`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setReviewStats({ average: d.average_rating ?? null, count: d.count ?? 0 });
      })
      .catch(() => {});
    fetch(`/api/stores/${storeId}/price-reports`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setPositivePct(d.positive_pct ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId, profile?.role]);

  useEffect(() => {
    if (profile?.role !== "admin" || !token) return;
    let cancelled = false;

    function loadPendingCount() {
      fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setPendingStoreCount(d.pending_store_count ?? 0);
        })
        .catch(() => {});
    }

    loadPendingCount();
    // Re-fetch the moment an admin approves/rejects/deletes a pending store
    // elsewhere on the site, so the badge never sits stale until the next
    // full page load.
    const unsubscribe = onPendingStoresChanged(loadPendingCount);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [profile?.role, token]);

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
  if (loading) return <div className="h-52 w-32 p-6" />;

  if (!profile) {
    return (
      <div className="flex gap-3 p-6 font-mono text-xs text-field/70">
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
      {/* Logo + account band: the same ink color as the rest of the sidebar,
          just a lighter shade (ink-soft), separated from the nav band below
          by a light hairline — rather than a different, unrelated color —
          so the two bands read as one family. */}
      <div className="flex w-full flex-col items-center bg-ink-soft px-6 py-8">
        <Link href="/" className="flex flex-col items-center">
          {/* public/pricebook-logo.svg — the shield outline is traced
              exactly from the supplied reference artwork (not redrawn), a
              solid dark-teal fill with a white double-line inset border,
              bold white "PB", and a green barcode + price-drop arrow underneath.
              Being a true vector, it has no resolution ceiling and renders
              pixel-sharp at any size on any background, which a raster
              export of the original artwork could never guarantee here. */}
          <img src="/pricebook-logo.svg" alt="" className="h-auto w-32" />
          <p className="mt-1 font-display text-xl font-bold leading-none">
            <span className="text-white">Price</span>
            <span className="text-mark">Book</span>
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-field/60">{t("Track Best Prices")}</p>
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
          {profile.role === "merchant" && storeId && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-field-raised px-2 py-1">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${trustCircleColor(positivePct)}`}
                title={t("Price-report accuracy")}
                aria-label={t("Price-report accuracy")}
              />
              <EmojiRating rating={reviewStats && reviewStats.count > 0 ? reviewStats.average : null} count={reviewStats?.count} size={18} />
            </div>
          )}
        </div>
      </div>

      <div className="h-px w-full bg-white/25" />

      <div className="flex w-full flex-1 flex-col items-center px-6 py-6">
      <nav className="flex w-full flex-col gap-0.5 text-sm">
        {profile.role === "admin" ? (
          <>
            <Link href="/admin" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <LayoutDashboard size={16} strokeWidth={1.75} /> Admin dashboard
            </Link>
            <Link href="/admin/users" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <Users size={16} strokeWidth={1.75} /> Customers
            </Link>
            <Link href="/admin/stores" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <ShieldCheck size={16} strokeWidth={1.75} /> Stores and Shops
            </Link>
            <Link href="/admin/pending-stores" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <ClipboardList size={16} strokeWidth={1.75} /> Store requests
              {pendingStoreCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-value px-1.5 font-mono text-[11px] font-bold text-white">
                  {pendingStoreCount}
                </span>
              )}
            </Link>
            <Link href="/admin/items" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <Boxes size={16} strokeWidth={1.75} /> Registered items
            </Link>
            <Link href="/admin/notifications" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <Bell size={16} strokeWidth={1.75} /> Notifications
            </Link>
          </>
        ) : profile.role === "merchant" ? (
          <>
            <Link href="/overview" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <LayoutDashboard size={16} strokeWidth={1.75} /> {t("Overview")}
            </Link>
            <Link href="/inventory" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <Package size={16} strokeWidth={1.75} /> {t("Manage inventory")}
            </Link>
            <Link href="/registered-items" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <Boxes size={16} strokeWidth={1.75} /> {t("Registered items")}
            </Link>
            <Link href="/notifications" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <Bell size={16} strokeWidth={1.75} /> {t("Notifications")}
            </Link>
          </>
        ) : (
          <>
            <Link href="/check-price" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <Camera size={16} strokeWidth={1.75} /> {t("Check price")}
            </Link>
            <Link href="/search-items" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <Search size={16} strokeWidth={1.75} /> {t("Search items")}
            </Link>
            <Link href="/history" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
              <Clock size={16} strokeWidth={1.75} /> {t("Search history")}
            </Link>
          </>
        )}
        <Link href="/settings" className="flex items-center justify-start gap-2 rounded-sm px-3 py-2 text-field/80 hover:text-white">
          <SettingsIcon size={16} strokeWidth={1.75} /> {t("Settings")}
        </Link>
      </nav>

      <button
        onClick={() => setConfirmingLogout(true)}
        className="mt-auto flex items-center justify-center gap-1.5 rounded-sm bg-red-600 px-4 py-2 font-mono text-[11px] font-medium text-white hover:bg-red-700"
      >
        <LogOut size={14} strokeWidth={2} /> {t("Log out")}
      </button>
      </div>

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
                className="rounded-sm border border-value bg-value px-4 py-2 font-display text-sm font-medium text-white hover:border-value-soft active:border-value-dark active:bg-value-dark"
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
