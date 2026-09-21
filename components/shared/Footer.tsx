"use client";

import Link from "next/link";
import { useAccount } from "@/lib/AccountProvider";

// Merchants see their own terms; everyone else (customers, admins, and
// logged-out visitors) sees the shopper terms as the sensible default,
// since there's one shared footer rather than a page-specific one.
export function Footer() {
  const { profile } = useAccount();
  const termsHref = profile?.role === "merchant" ? "/terms/merchant" : "/terms/customer";

  return (
    <footer className="mt-auto px-5 py-6 text-center text-xs text-ash">
      © {new Date().getFullYear()} PriceBook ·{" "}
      <Link href={termsHref} className="underline hover:text-ink">
        Terms &amp; Conditions
      </Link>
    </footer>
  );
}
