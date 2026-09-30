"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Settings as SettingsIcon, X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useAccount } from "@/lib/AccountProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";

// Replaces the desktop sidebar on phones: just the wordmark, the language
// switcher, and a tappable avatar that opens a small profile menu (name,
// role, Settings, Log out) — instead of the full profile card + nav list
// stacking above the page content.
export function MobileTopBar() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, storeName, storeLogoUrl, token } = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const displayName = storeName || profile?.full_name || profile?.email || "";
  const initial = displayName ? displayName[0]?.toUpperCase() : "";

  async function confirmLogout() {
    setLoggingOut(true);
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

  return (
    <header className="relative z-30 flex items-center justify-between border-b border-line bg-field-raised px-4 py-3">
      <Link href="/" className="flex items-center">
        <img src="/pricebook-icon-dark.png" alt="PriceBook" className="h-10 w-auto" />
      </Link>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        {profile && (
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Account"
            aria-expanded={menuOpen}
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-xs font-semibold text-field ring-2 ring-transparent transition hover:ring-value/40"
          >
            {storeLogoUrl ? (
              <img src={storeLogoUrl} alt="" className="h-8 w-8 object-cover" />
            ) : (
              <span>{initial}</span>
            )}
          </button>
        )}
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-4 top-14 z-50 w-56 overflow-hidden rounded-xl border border-line bg-field-raised shadow-xl">
            <div className="flex items-center gap-3 border-b border-line bg-ink px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-semibold text-field">
                {storeLogoUrl ? <img src={storeLogoUrl} alt="" className="h-9 w-9 object-cover" /> : initial}
              </span>
              <div className="min-w-0 text-left">
                <p className="truncate font-display text-[13px] font-semibold text-field">{displayName}</p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-field/50">{profile?.role}</p>
              </div>
            </div>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-sm text-ink hover:bg-field"
            >
              <SettingsIcon size={16} strokeWidth={1.75} /> {t("Settings")}
            </Link>
            <button
              onClick={() => {
                setMenuOpen(false);
                setConfirmingLogout(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-red-600 hover:bg-field"
            >
              <LogOut size={16} strokeWidth={1.75} /> {t("Log out")}
            </button>
          </div>
        </>
      )}

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
                disabled={loggingOut}
                className="rounded-sm bg-blue-600 px-4 py-2 font-display text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {t("Discard")}
              </button>
              <button
                onClick={confirmLogout}
                disabled={loggingOut}
                className="rounded-sm bg-red-600 px-4 py-2 font-display text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                {t("Log out")}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
