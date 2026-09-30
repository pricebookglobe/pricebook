"use client";

import Link from "next/link";
import { useAccount } from "@/lib/AccountProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";

// Replaces the desktop sidebar on phones: just the wordmark, the language
// switcher, and a tappable avatar that opens Settings — instead of the full
// profile card + nav list stacking above the page content.
export function MobileTopBar() {
  const { profile, storeName, storeLogoUrl } = useAccount();
  const displayName = storeName || profile?.full_name || profile?.email || "";
  const initial = displayName ? displayName[0]?.toUpperCase() : "";

  return (
    <header className="flex items-center justify-between border-b border-line bg-field-raised px-4 py-3">
      <Link href="/" className="flex items-center">
        <img src="/pricebook-icon-dark.png" alt="PriceBook" className="h-7 w-auto" />
      </Link>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        {profile && (
          <Link
            href="/settings"
            aria-label="Account"
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-xs font-semibold text-field"
          >
            {storeLogoUrl ? (
              <img src={storeLogoUrl} alt="" className="h-8 w-8 object-cover" />
            ) : (
              <span>{initial}</span>
            )}
          </Link>
        )}
      </div>
    </header>
  );
}
