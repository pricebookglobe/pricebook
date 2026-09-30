"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckPriceExperience } from "@/components/check-price/CheckPriceExperience";
import { useAccount } from "@/lib/AccountProvider";

export default function SearchItemsPage() {
  const router = useRouter();
  const { profile, loading } = useAccount();

  useEffect(() => {
    if (loading) return;
    if (!profile) router.replace("/login?next=/search-items");
    else if (profile.role === "admin") router.replace("/admin");
    else if (profile.role === "merchant") router.replace("/overview");
  }, [loading, profile, router]);

  if (loading || !profile || profile.role !== "customer") return null;

  // GeolocationProvider now lives in this route group's layout.tsx, shared
  // with Check Price, so it doesn't restart on every tab switch.
  return <CheckPriceExperience initialMode="text" />;
}
