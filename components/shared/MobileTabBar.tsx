"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Search, Clock, Settings as SettingsIcon, LayoutDashboard, Package, Boxes, Bell, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useAccount } from "@/lib/AccountProvider";

type Tab = { href: string; label: string; icon: LucideIcon };

// A fixed bottom tab bar, shown only below the md breakpoint, replacing the
// desktop sidebar's nav links so the phone experience feels like a native
// app rather than a website with its nav dumped above the page content.
// Admins aren't included — the admin console is desktop-only in practice
// and has too many sections to fit a phone-width tab bar.
export function MobileTabBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { profile } = useAccount();

  if (!profile || profile.role === "admin") return null;

  const tabs: Tab[] =
    profile.role === "merchant"
      ? [
          { href: "/overview", label: t("Overview"), icon: LayoutDashboard },
          { href: "/inventory", label: t("Manage inventory"), icon: Package },
          { href: "/registered-items", label: t("Registered items"), icon: Boxes },
          { href: "/notifications", label: t("Notifications"), icon: Bell }
        ]
      : [
          { href: "/check-price", label: t("Check price"), icon: Camera },
          { href: "/search-items", label: t("Search items"), icon: Search },
          { href: "/history", label: t("Search history"), icon: Clock },
          { href: "/settings", label: t("Settings"), icon: SettingsIcon }
        ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line bg-ink pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-center"
          >
            <Icon size={20} strokeWidth={1.8} className={active ? "text-value" : "text-field/50"} />
            <span className={`text-[9.5px] leading-tight ${active ? "text-value" : "text-field/50"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
