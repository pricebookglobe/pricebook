"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoreRanking, type RankingRow } from "@/lib/api";
import { RankingBadge } from "@/components/merchant/RankingBadge";
import { createBrowserSupabase } from "@/lib/supabaseClient";

export default function MerchantDashboard() {
  const router = useRouter();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/dashboard");
        return;
      }
      const res = await fetch("/api/merchant/store", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      const store = await res.json();
      if (!store) {
        router.push("/store-profile");
        return;
      }
      setStoreName(store.name);
      const ranking = await getStoreRanking(store.id);
      setRows(ranking);
      setLoading(false);
    });
  }, [router]);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {storeName ?? "Your store"}
          </h1>
          <p className="mt-1 text-sm text-ash">Ranked daily against every store in your 5km zone.</p>
        </div>
        <a
          href="/inventory/add"
          className="rounded-sm bg-ink px-3 py-1.5 font-display text-sm font-medium text-field"
        >
          + Add item
        </a>
      </header>

      {loading && <p className="text-sm text-ash">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-ash">No ranking yet — add inventory and check back after the next nightly run.</p>
      )}

      {rows.map((row) => (
        <RankingBadge key={row.category} row={row} />
      ))}
    </main>
  );
}
