"use client";

import { useEffect, useState } from "react";
import { getStoreRanking, type RankingRow } from "@/lib/api";
import { RankingBadge } from "@/components/merchant/RankingBadge";

// MVP note: swap this for the merchant's actual store id from their
// Supabase Auth session once auth is wired up (Supabase Auth + RLS,
// see supabase/migrations/0001_init.sql).
const DEMO_STORE_ID = "00000000-0000-0000-0000-000000000000";

export default function MerchantDashboard() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStoreRanking(DEMO_STORE_ID)
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Your competitiveness</h1>
        <p className="mt-1 text-sm text-ash">Ranked daily against every store in your 5km zone.</p>
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
