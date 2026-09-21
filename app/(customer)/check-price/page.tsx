"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GeolocationProvider } from "@/components/shared/GeolocationProvider";
import { CheckPriceExperience } from "@/components/check-price/CheckPriceExperience";
import { useAccount } from "@/lib/AccountProvider";

export default function CheckPricePage() {
  const router = useRouter();
  const { profile, loading } = useAccount();

  useEffect(() => {
    if (loading) return;
    if (!profile) router.replace("/login?next=/check-price");
    else if (profile.role === "admin") router.replace("/admin");
    else if (profile.role === "merchant") router.replace("/overview");
  }, [loading, profile, router]);

  if (loading || !profile || profile.role !== "customer") return null;

  return (
    <GeolocationProvider>
      <CheckPriceExperience initialMode="menu" />
    </GeolocationProvider>
  );
}
